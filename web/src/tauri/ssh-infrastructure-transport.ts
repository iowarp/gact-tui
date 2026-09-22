import type { InfrastructureTarget, SshRoute } from '@clio/core/v3';
import type { ClioRepository } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';
import { inTauri } from '@/lib/transport/tauri-runtime';

export type SshTransportStatus = {
  session_id: string;
  state:
    | 'connected'
    | 'reconnecting'
    | 'reauthentication_required'
    | 'disconnected'
    | 'state_unknown';
  reused: boolean;
  output: string;
};

export type SshConnectionTest = {
  targetId: string;
  status: SshTransportStatus;
};

type CommandResult = { exit_code: number; stdout: string; stderr: string };
type BridgeMessage =
  | { type: 'exec'; request_id: string; command: Record<string, unknown> }
  | {
      type: 'forward';
      request_id: string;
      remote_host: string;
      remote_port: number;
      local_port?: number;
    };

type ActiveBridge = {
  socket: WebSocket;
  sessionId: string;
  targetId: string;
  routeKey: string;
};

const bridges = new Map<string, ActiveBridge>();

/** Open the same interactive OpenSSH PTY used by deployment, without attaching it to CLIO. */
export async function openSshConnectionTest(route: SshRoute): Promise<SshConnectionTest> {
  if (!inTauri()) throw new Error(`Interactive SSH testing requires ${vocab.product}.`);
  const targetId = `ssh-test-${crypto.randomUUID()}`;
  const { invoke } = await import('@tauri-apps/api/core');
  const status = await invoke<SshTransportStatus>('ssh_transport_open', {
    request: { target_id: targetId, route, interactive: true },
  });
  return { targetId, status };
}

/** Close an isolated connection test without disturbing a compatible shared transport. */
export async function closeSshConnectionTest(test: SshConnectionTest): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('ssh_transport_close', {
    sessionId: test.status.session_id,
    targetId: test.targetId,
  });
}

/** Start or reuse system OpenSSH and attach its narrow execution bridge to the agent. */
export async function attachInfrastructureSshTransport(
  endpoint: string,
  token: string | undefined,
  target: InfrastructureTarget,
  options: { interactive?: boolean } = {},
): Promise<SshTransportStatus> {
  if (!inTauri()) throw new Error(`Interactive SSH transport requires ${vocab.product}.`);
  if (target.kind !== 'ssh' || !target.ssh) throw new Error('The target is not an SSH host.');
  const routeKey = JSON.stringify(target.ssh);
  const existing = bridges.get(target.id);
  if (existing && existing.routeKey === routeKey && existing.socket.readyState <= WebSocket.OPEN) {
    return sshTransportStatus(existing.sessionId);
  }
  if (existing) await closeInfrastructureSshTransport(target.id);
  const { invoke } = await import('@tauri-apps/api/core');
  const status = await invoke<SshTransportStatus>('ssh_transport_open', {
    request: {
      target_id: target.id,
      route: target.ssh satisfies SshRoute,
      interactive: options.interactive ?? true,
    },
  });
  if (status.state !== 'connected') return status;
  const socket = infrastructureSocket(endpoint, token, target.id);
  const bridge: ActiveBridge = {
    socket,
    sessionId: status.session_id,
    targetId: target.id,
    routeKey,
  };
  bridges.set(target.id, bridge);
  socket.addEventListener('message', (event) => void handleBridgeMessage(bridge, event));
  socket.addEventListener('close', () => {
    if (bridges.get(target.id) === bridge) bridges.delete(target.id);
  });
  await socketReady(socket);
  return status;
}

/** Return current native state for one reusable OpenSSH session. */
export async function sshTransportStatus(sessionId: string): Promise<SshTransportStatus> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<SshTransportStatus>('ssh_transport_status', { sessionId });
}

/** Send one response to the exact prompt currently displayed by OpenSSH. */
export async function writeSshTransport(sessionId: string, data: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('ssh_transport_write', { sessionId, data });
}

/** Disconnect Desktop transport without deleting CLIO's durable target. */
export async function closeInfrastructureSshTransport(targetId: string): Promise<void> {
  const bridge = bridges.get(targetId);
  if (!bridge) return;
  bridges.delete(targetId);
  bridge.socket.close();
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('ssh_transport_close', { sessionId: bridge.sessionId, targetId });
}

/** Restore silent SSH sessions after Desktop startup/resume without replaying service actions. */
export async function recoverInfrastructureSshTransports(
  repository: Pick<
    ClioRepository,
    | 'checkExternalServiceConnection'
    | 'externalServiceConnections'
    | 'infrastructureTargets'
    | 'managedServiceCatalog'
    | 'setInfrastructureTransportState'
  >,
  endpoint: string,
  token: string | undefined,
): Promise<void> {
  const externalConnections = await repository.externalServiceConnections();
  await Promise.allSettled(
    externalConnections.map((connection) =>
      repository.checkExternalServiceConnection(connection.id),
    ),
  );
  const targets = (await repository.infrastructureTargets()).filter(
    (target) => target.kind === 'ssh' && target.auto_reconnect,
  );
  for (const target of targets) {
    await repository.setInfrastructureTransportState(target.id, 'reconnecting');
    try {
      let status = await attachInfrastructureSshTransport(endpoint, token, target, {
        interactive: false,
      });
      for (
        let attempt = 0;
        (status.state === 'reconnecting' || status.state === 'state_unknown') && attempt < 15;
        attempt += 1
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
        status = await sshTransportStatus(status.session_id);
      }
      await repository.setInfrastructureTransportState(target.id, status.state);
      if (status.state === 'connected') {
        await attachInfrastructureSshTransport(endpoint, token, target);
        try {
          await repository.managedServiceCatalog(target.id);
        } catch (error) {
          console.error(`Could not reconcile infrastructure on ${target.label}`, error);
        }
        continue;
      }
      await repository.setInfrastructureTransportState(target.id, 'reauthentication_required');
    } catch {
      await repository.setInfrastructureTransportState(target.id, 'reauthentication_required');
    }
  }
}

function infrastructureSocket(endpoint: string, token: string | undefined, targetId: string) {
  const base = new URL(endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = `/v1/infrastructure/targets/${encodeURIComponent(targetId)}/transport`;
  base.search = '';
  const protocols = ['clio.infrastructure.v1'];
  if (token) protocols.push(`clio-bearer.${base64Url(token)}`);
  return new WebSocket(base, protocols);
}

async function handleBridgeMessage(bridge: ActiveBridge, event: MessageEvent): Promise<void> {
  let message: BridgeMessage;
  try {
    message = JSON.parse(String(event.data)) as BridgeMessage;
  } catch {
    return;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  if (message.type === 'exec') {
    try {
      const result = await invoke<CommandResult>('ssh_transport_exec', {
        sessionId: bridge.sessionId,
        command: message.command,
      });
      bridge.socket.send(
        JSON.stringify({ type: 'exec_result', request_id: message.request_id, result }),
      );
    } catch (error) {
      bridge.socket.send(
        JSON.stringify({
          type: 'exec_result',
          request_id: message.request_id,
          result: { exit_code: 255, stdout: '', stderr: errorMessage(error) },
        }),
      );
    }
    return;
  }
  try {
    const localUrl = await invoke<string>('ssh_transport_forward', {
      sessionId: bridge.sessionId,
      remoteHost: message.remote_host,
      remotePort: message.remote_port,
      localPort: message.local_port,
    });
    bridge.socket.send(
      JSON.stringify({
        type: 'forward_result',
        request_id: message.request_id,
        local_url: localUrl,
      }),
    );
  } catch (error) {
    bridge.socket.send(
      JSON.stringify({
        type: 'forward_result',
        request_id: message.request_id,
        error: errorMessage(error),
      }),
    );
  }
}

function socketReady(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const opened = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error(`${vocab.agent} rejected the SSH transport attachment.`));
    };
    const cleanup = () => {
      socket.removeEventListener('open', opened);
      socket.removeEventListener('error', failed);
    };
    socket.addEventListener('open', opened);
    socket.addEventListener('error', failed);
  });
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
