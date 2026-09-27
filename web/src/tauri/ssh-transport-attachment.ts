import { vocab } from '@/lib/brand-vocabulary';

/**
 * Bridge protocols, newest first. With `clio.infrastructure.v2` the agent
 * completes the handshake before deciding, then either sends an `attached`
 * frame or closes with a typed refusal (4401 authentication_required, 4404
 * target_not_found, 4409 target_not_ssh). An agent that only speaks v1 refuses
 * before the handshake, which the webview reports as an error with no reason.
 */
export const TRANSPORT_PROTOCOL_V2 = 'clio.infrastructure.v2';
export const TRANSPORT_PROTOCOL_V1 = 'clio.infrastructure.v1';

/** Open the agent's transport socket for one infrastructure target. */
export function infrastructureSocket(
  endpoint: string,
  token: string | undefined,
  targetId: string,
): WebSocket {
  const base = new URL(endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = `/v1/infrastructure/targets/${encodeURIComponent(targetId)}/transport`;
  base.search = '';
  const protocols = [TRANSPORT_PROTOCOL_V2, TRANSPORT_PROTOCOL_V1];
  if (token) protocols.push(`clio-bearer.${base64Url(token)}`);
  return new WebSocket(base, protocols);
}

/** The agent's own reason for refusing an attachment, in plain language. */
export function transportRefusalMessage(code: number, reason: string): string {
  if (code === 4401 || reason === 'authentication_required') {
    return `${vocab.agent} did not accept this app's sign-in for the SSH connection. Reconnect to ${vocab.agent}, then deploy again.`;
  }
  if (code === 4404 || reason === 'target_not_found') {
    return `${vocab.agent} no longer has this SSH host saved. Choose the host again, then deploy.`;
  }
  if (code === 4409 || reason === 'target_not_ssh') {
    return `${vocab.agent} can attach an SSH connection only to an SSH host, and this host is not one.`;
  }
  const said = reason ? `: ${reason}` : '';
  return `${vocab.agent} closed the SSH connection before attaching it (code ${code}${said}).`;
}

/** What the webview reports when the handshake itself failed: no reason is available. */
export const HANDSHAKE_FAILED_MESSAGE = `${vocab.agent} refused the SSH connection before it opened and gave no reason. An older ${vocab.agent} does not report one; update ${vocab.agent} and try again.`;

/**
 * Resolve once the agent has attached the transport, or reject with its reason.
 *
 * A v2 agent confirms with an `attached` frame (the handshake alone is not
 * admission); a v1 agent's completed handshake is its admission.
 */
export function waitForAttachment(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const settle = (outcome: () => void) => {
      socket.removeEventListener('open', opened);
      socket.removeEventListener('message', message);
      socket.removeEventListener('error', failed);
      socket.removeEventListener('close', closed);
      outcome();
    };
    const opened = () => {
      if (socket.protocol !== TRANSPORT_PROTOCOL_V2) settle(resolve);
    };
    const message = (event: MessageEvent) => {
      if (attachedFrame(event.data)) settle(resolve);
    };
    const failed = () => settle(() => reject(new Error(HANDSHAKE_FAILED_MESSAGE)));
    const closed = (event: CloseEvent) =>
      settle(() => reject(new Error(transportRefusalMessage(event.code, event.reason))));
    socket.addEventListener('open', opened);
    socket.addEventListener('message', message);
    socket.addEventListener('error', failed);
    socket.addEventListener('close', closed);
    if (socket.readyState === WebSocket.OPEN) opened();
  });
}

function attachedFrame(data: unknown): boolean {
  try {
    const parsed = JSON.parse(String(data)) as { type?: unknown };
    return parsed.type === 'attached';
  } catch {
    return false;
  }
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
