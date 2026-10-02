import { TransportError, type InfrastructureTarget } from '@clio/core/v3';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { vocab } from '@/lib/brand-vocabulary';
import { createRepository, type ConnectionSettings } from '@/lib/connection';
import type { SshHost } from '@/lib/ssh-hosts';
import { TauriClioTransport } from '@/lib/transport/tauri-transport';
import { waitForManagedBackend } from '@/tauri/managed-backend';
import {
  attachInfrastructureSshTransport,
  cancelSshTransport,
  sshTransportLog,
  sshTransportStatus,
  writeSshTransport,
  type SshStateEvent,
  type SshStepEvent,
  type SshTransportStatus,
} from '@/tauri/ssh-infrastructure-transport';
import {
  deployProgressReducer,
  initialDeployProgress,
  oneLineReason,
  type DeployProgress,
} from './deploy-progress-model';
import {
  abortableDelay,
  claimClioAgent,
  savedSshRoute,
  sshTargetDefinition,
  targetMatchesHost,
  waitForConflictAnswer,
  type ConflictAnswer,
  type FoundConflict,
  NewClioInstance,
} from './managed-service-target-utils';

export type RemoteDeploymentPhase = 'idle' | 'running' | 'cancelling' | 'failed' | 'cancelled';

export type { FoundConflict } from './managed-service-target-utils';

export type RemoteDeployment = {
  phase: RemoteDeploymentPhase;
  progress: DeployProgress;
  /** The live OpenSSH session, including any authentication prompt. */
  transport?: SshTransportStatus;
  /** The cleaned transport log, fetched when a deployment fails. */
  details?: string;
  /** Set while `deploy` is paused on "Connect to the running CLIO (vX)" or "Replace it". */
  conflict?: FoundConflict;
  /** Answer a found conflict; a no-op when none is pending. */
  resolveConflict: (choice: ConflictAnswer) => void;
  deploy: (
    host: SshHost,
    name: string,
    options?: { port: number; keepRunning: boolean },
  ) => Promise<void>;
  cancel: () => Promise<void>;
};

/**
 * Deploy the agent to an SSH host through the desktop transport and report
 * real progress: the stage list is driven by the transport's own step events
 * (framed remote commands and the tunnel), authentication state, and the
 * remote agent's own answers, never by elapsed time. "Connecting" is done
 * only once the remote agent answered its health check through the tunnel
 * and `onReady` (the actual connection) succeeded; any failure keeps the
 * stage list open on that stage. Cancel kills the OpenSSH process tree and
 * cancels the agent's operation.
 */
export function useRemoteDeployment(
  onReady: (settings: ConnectionSettings) => Promise<void>,
): RemoteDeployment {
  const activeRepository = useRef<ReturnType<typeof createRepository> | undefined>(undefined);
  const [progress, dispatch] = useReducer(deployProgressReducer, initialDeployProgress);
  const [phase, setPhase] = useState<RemoteDeploymentPhase>('idle');
  const [transport, setTransport] = useState<SshTransportStatus>();
  const [details, setDetails] = useState<string>();
  const [conflict, setConflict] = useState<FoundConflict>();
  const session = useRef<string | undefined>(undefined);
  const operation = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);
  const conflictChoice = useRef<((choice: ConflictAnswer) => void) | undefined>(undefined);

  const resolveConflict = useCallback((choice: ConflictAnswer) => {
    conflictChoice.current?.(choice);
  }, []);

  const listening = useRef<Promise<Array<() => void>> | undefined>(undefined);

  /** Subscribe to the desktop's transport events once a deployment starts. */
  const listen = useCallback(() => {
    listening.current ??= import('@tauri-apps/api/event').then(({ listen: subscribe }) =>
      Promise.all([
        subscribe<SshStepEvent>('clio:ssh-transport-step', ({ payload }) => {
          if (payload.session_id !== session.current) return;
          dispatch({ type: 'step', step: payload, at: Date.now() });
        }),
        subscribe<SshStateEvent>('clio:ssh-transport-state', ({ payload }) => {
          if (payload.session_id !== session.current) return;
          setTransport((current) =>
            current ? { ...current, state: payload.state, prompt: payload.prompt } : current,
          );
          if (payload.prompt) dispatch({ type: 'prompt', at: Date.now() });
          if (payload.state === 'connected') dispatch({ type: 'connected', at: Date.now() });
        }),
      ]),
    );
    return listening.current;
  }, []);

  useEffect(
    () => () => {
      void listening.current?.then((stops) => stops.forEach((stop) => stop()));
    },
    [],
  );

  const observe = useCallback((status: SshTransportStatus) => {
    session.current = status.session_id;
    setTransport(status);
    if (status.prompt) dispatch({ type: 'prompt', at: Date.now() });
    if (status.state === 'connected') dispatch({ type: 'connected', at: Date.now() });
  }, []);

  /**
   * Run the `clio_agent` install action to completion. A found conflict
   * pauses here instead of failing the deployment: `conflict` is set for
   * the dialog to show "Connect to the running CLIO (vX)" or "Replace it",
   * and the action is re-issued with the person's answer once
   * `resolveConflict` is called. Never decides which itself.
   */
  const runInstallToCompletion = useCallback(
    (
      repository: ReturnType<typeof createRepository>,
      registered: InfrastructureTarget,
      signal: AbortSignal,
      configuration: Record<string, string>,
    ) =>
      claimClioAgent(
        repository,
        registered.id,
        signal,
        async (found) => {
          setConflict(found);
          try {
            return await waitForConflictAnswer(signal, conflictChoice);
          } finally {
            setConflict(undefined);
          }
        },
        (id) => {
          operation.current = id;
        },
        configuration,
      ),
    [],
  );

  const deploy = useCallback(
    async (host: SshHost, name: string, options = { port: 17800, keepRunning: false }) => {
      const controller = new AbortController();
      abort.current = controller;
      session.current = undefined;
      operation.current = undefined;
      setTransport(undefined);
      setDetails(undefined);
      setPhase('running');
      dispatch({ type: 'start', at: Date.now() });
      try {
        await listen();
        // Infrastructure always belongs to this Desktop's local controller,
        // even while the active conversation is connected to a remote agent.
        const handle = await waitForManagedBackend({});
        const settings = { endpoint: handle.url, token: handle.bearer_token || undefined };
        const repository = createRepository(settings);
        const { invoke } = await import('@tauri-apps/api/core');
        const desktopId = await invoke<string>('desktop_deployment_owner');
        activeRepository.current = repository;
        let deployedHost = host;
        let port = options.port;
        let registered = await registerTarget(repository, deployedHost);
        let status = await attachInfrastructureSshTransport(
          settings.endpoint,
          settings.token,
          registered,
        );
        observe(status);
        while (status.state !== 'connected') {
          if (status.state === 'disconnected')
            throw new Error(
              status.failure ||
                `OpenSSH disconnected from ${host.label} before authentication finished.`,
            );
          await abortableDelay(250, controller.signal);
          status = await sshTransportStatus(status.session_id);
          observe(status);
        }
        await repository.setInfrastructureTransportState(registered.id, 'connected');
        await attachInfrastructureSshTransport(settings.endpoint, settings.token, registered);
        for (;;) {
          try {
            await runInstallToCompletion(repository, registered, controller.signal, {
              port: String(port),
              keep_running: String(options.keepRunning),
              desktop_id: desktopId,
            });
            break;
          } catch (error) {
            if (!(error instanceof NewClioInstance) || !error.conflict.owner) throw error;
            port += 1;
            if (port > 65535) throw new Error('Choose a lower port to start another agent.');
            deployedHost = {
              ...host,
              label: `${host.label} (${port})`,
              installRoot: `${error.conflict.owner}-instance-${port}`,
            };
            registered = await repository.createInfrastructureTarget(
              sshTargetDefinition(deployedHost),
            );
            observe(
              await attachInfrastructureSshTransport(settings.endpoint, settings.token, registered),
            );
          }
        }
        dispatch({ type: 'open', at: Date.now() });
        const catalog = await repository.managedServiceCatalog(registered.id, controller.signal);
        const service = catalog.services.find((candidate) => candidate.id === 'clio_agent');
        if (!service?.connection_url)
          throw new Error(`The deployed ${vocab.agent} did not publish a connection address.`);
        if (service.state !== 'running')
          throw new Error(`${vocab.agent} on ${host.label} is not running (${service.state}).`);
        await checkHealth(service.connection_url, controller.signal);
        await onReady({
          endpoint: service.connection_url,
          label: name,
          location: host.label,
          infrastructure: {
            targetId: registered.id,
            serviceId: 'clio_agent',
            route: {
              ...savedSshRoute(deployedHost),
              remotePort: port,
              keepRunning: options.keepRunning,
            },
          },
        });
        dispatch({ type: 'opened', at: Date.now() });
        setPhase('idle');
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        dispatch({ type: 'fail', reason: oneLineReason(message), at: Date.now() });
        const log = session.current
          ? await sshTransportLog(session.current).catch(
              (reason: unknown) => `The transport log is unavailable: ${String(reason)}`,
            )
          : '';
        // The full message can carry more than its last line; keep both.
        setDetails([log, message].filter(Boolean).join('\n\n'));
        setPhase('failed');
      }
    },
    [listen, observe, onReady, runInstallToCompletion],
  );

  /**
   * Cancel without leaving anything behind on the remote host: interrupt the
   * remote command that is running, let the agent cancel its operation (it
   * tears down what this deploy started over the still-open session, shown
   * as Cleaning up), and only then kill the OpenSSH process tree.
   */
  const cancel = useCallback(async () => {
    abort.current?.abort(new DOMException('Deployment cancelled', 'AbortError'));
    dispatch({ type: 'cancel', at: Date.now() });
    setPhase('cancelling');
    const problems: string[] = [];
    const sessionId = session.current;
    if (sessionId && operation.current) {
      // Ctrl-C to the remote shell's foreground command; the shell itself stays.
      await writeSshTransport(sessionId, '\u0003').catch((error: unknown) =>
        problems.push(`The remote command could not be interrupted: ${String(error)}`),
      );
    }
    if (operation.current) {
      await activeRepository.current
        ?.cancelInfrastructureOperation(operation.current)
        .catch((error: unknown) =>
          problems.push(`The remote operation could not be cancelled: ${String(error)}`),
        );
    }
    if (sessionId) {
      await cancelSshTransport(sessionId).catch((error: unknown) =>
        problems.push(`OpenSSH could not be stopped: ${String(error)}`),
      );
    }
    setPhase('cancelled');
    if (problems.length) setDetails(problems.join('\n'));
  }, []);

  return { phase, progress, transport, details, conflict, resolveConflict, deploy, cancel };
}

/**
 * The remote agent's own answer through the tunnel: `/v1/health` returns 200,
 * or 503 while a dependency is still starting. Anything else is a failure.
 *
 * Asked through the desktop's native HTTP bridge, the same path the
 * connection itself uses next. A WebView `fetch()` cannot be used: the page's
 * origin (`http://tauri.localhost`) is cross-origin to the tunnel's loopback
 * port and CLIO sends no CORS headers for it, so the browser discards the
 * answer and reports "Failed to fetch" even when CLIO replied (#1528).
 */
async function checkHealth(endpoint: string, signal: AbortSignal): Promise<void> {
  const transport = new TauriClioTransport({ endpoint });
  try {
    await transport.request<unknown>({
      method: 'GET',
      path: '/v1/health',
      acceptStatuses: [503],
      decode: (value) => value,
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof TransportError && error.status !== undefined)
      throw new Error(`${vocab.agent} did not answer through the tunnel (HTTP ${error.status}).`);
    throw new Error(
      `${vocab.agent} did not answer through the tunnel: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Create or update the durable infrastructure target for this host. */
async function registerTarget(
  repository: ReturnType<typeof createRepository>,
  host: SshHost,
): Promise<InfrastructureTarget> {
  const targets = await repository.infrastructureTargets();
  const definition = sshTargetDefinition(host);
  const existing = targets.find(
    (candidate) =>
      targetMatchesHost(candidate, host) && candidate.install_root === (host.installRoot || ''),
  );
  return existing
    ? repository.updateInfrastructureTarget(existing.id, definition)
    : repository.createInfrastructureTarget(definition);
}
