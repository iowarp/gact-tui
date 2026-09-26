import type { InfrastructureTarget } from '@clio/core/v3';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import type { ConnectionSettings } from '@/lib/connection';
import type { SshHost } from '@/lib/ssh-hosts';
import { useConnectionSettings } from '@/providers/connection-provider';
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
  targetMatchesHost,
  waitForOperation,
} from './managed-service-target-utils';

export type RemoteDeploymentPhase = 'idle' | 'running' | 'cancelling' | 'failed' | 'cancelled';

export type RemoteDeployment = {
  phase: RemoteDeploymentPhase;
  progress: DeployProgress;
  /** The live OpenSSH session, including any authentication prompt. */
  transport?: SshTransportStatus;
  /** The cleaned transport log, fetched when a deployment fails. */
  details?: string;
  deploy: (host: SshHost, name: string) => Promise<void>;
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
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [progress, dispatch] = useReducer(deployProgressReducer, initialDeployProgress);
  const [phase, setPhase] = useState<RemoteDeploymentPhase>('idle');
  const [transport, setTransport] = useState<SshTransportStatus>();
  const [details, setDetails] = useState<string>();
  const session = useRef<string | undefined>(undefined);
  const operation = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);

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

  const deploy = useCallback(
    async (host: SshHost, name: string) => {
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
        const registered = await registerTarget(repository, host);
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
        const started = await repository.runManagedServiceAction('clio_agent', {
          target_id: registered.id,
          action: 'install',
          variant_id: 'released',
          configuration: {},
        });
        operation.current = started.id;
        await waitForOperation(repository, started, controller.signal);
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
          infrastructure: { targetId: registered.id, serviceId: 'clio_agent' },
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
    [listen, observe, onReady, repository, settings.endpoint, settings.token],
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
      await repository
        .cancelInfrastructureOperation(operation.current)
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
  }, [repository]);

  return { phase, progress, transport, details, deploy, cancel };
}

/**
 * The remote agent's own answer through the tunnel: `/v1/health` returns 200,
 * or 503 while a dependency is still starting. Anything else is a failure.
 */
async function checkHealth(endpoint: string, signal: AbortSignal): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${endpoint.replace(/\/+$/u, '')}/v1/health`, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      `${vocab.agent} did not answer through the tunnel: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (response.status !== 200 && response.status !== 503)
    throw new Error(`${vocab.agent} did not answer through the tunnel (HTTP ${response.status}).`);
}

/** Create or update the durable infrastructure target for this host. */
async function registerTarget(
  repository: ReturnType<typeof useRepository>,
  host: SshHost,
): Promise<InfrastructureTarget> {
  const targets = await repository.infrastructureTargets();
  const definition = {
    kind: 'ssh' as const,
    label: host.label,
    // Saved OpenSSH profiles come from the desktop's Rust bridge, whose
    // optional fields round-trip as `null` when unset; the backend stores
    // plain strings, so a bare `null` fails request validation (#1438).
    install_root: host.installRoot || '',
    ssh: {
      profile: host.profile ?? '',
      host: host.host ?? '',
      user: host.user ?? '',
      port: host.port,
      jump_hosts: host.jumpHosts ?? [],
      identity_file: host.identityFile ?? '',
      platform: host.platform,
    },
  };
  const existing = targets.find((candidate) => targetMatchesHost(candidate, host));
  return existing
    ? repository.updateInfrastructureTarget(existing.id, definition)
    : repository.createInfrastructureTarget(definition);
}
