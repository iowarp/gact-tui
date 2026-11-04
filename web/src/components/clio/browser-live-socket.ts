import {
  BROWSER_LIVE_PROTOCOL,
  browserLivePath,
  browserLiveStateSchema,
  type BrowserLiveState,
} from '@clio/core/v3';

/** What the person sends to the shared page, in page CSS pixels. */
export type BrowserInput =
  | { type: 'mouse'; action: 'move' | 'down' | 'up' | 'click'; x: number; y: number; button?: string; count?: number }
  | { type: 'wheel'; dx: number; dy: number }
  | { type: 'key'; action: 'down' | 'up' | 'press'; key: string }
  | { type: 'text'; text: string }
  | { type: 'resize'; width: number; height: number }
  | { type: 'navigate'; action: 'goto' | 'back' | 'forward' | 'reload'; url?: string }
  | { type: 'theme'; accent: string };

export interface BrowserLiveHandlers {
  onFrame: (frame: Blob) => void;
  onState: (state: BrowserLiveState) => void;
  /** The server said why it ignored or rejected an input (view only, a bad message). */
  onNotice?: (reason: string, detail?: string) => void;
  /** The view ended; `reason` is the server's close reason when it refused. */
  onClose: (code: number, reason: string) => void;
}

export interface BrowserLiveConnection {
  send: (input: BrowserInput) => void;
  close: () => void;
}

/** The plain-language reason for a refused live view. */
export function liveRefusalMessage(code: number, reason: string): string {
  if (code === 4401) return 'This browser view needs the connection’s access token.';
  if (code === 4403) return 'This window may not open the live view of this page.';
  if (code === 4404) return 'This page is closed.';
  return reason || 'The live view ended.';
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

/** The live view's WebSocket URL and subprotocols for one page. */
export function browserLiveSocketTarget(
  endpoint: string,
  token: string | undefined,
  sessionId: string,
  pageId: string,
): { url: URL; protocols: string[] } {
  const url = new URL(endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = browserLivePath(sessionId, pageId);
  url.search = '';
  const protocols = [BROWSER_LIVE_PROTOCOL];
  if (token) protocols.push(`clio-bearer.${base64Url(token)}`);
  return { url, protocols };
}

/** Open the live view of one page: frames and state in, the person's input out. */
export function openBrowserLive(
  endpoint: string,
  token: string | undefined,
  sessionId: string,
  pageId: string,
  handlers: BrowserLiveHandlers,
): BrowserLiveConnection {
  const { url, protocols } = browserLiveSocketTarget(endpoint, token, sessionId, pageId);
  const socket = new WebSocket(url, protocols);
  socket.binaryType = 'blob';
  socket.addEventListener('message', (event: MessageEvent<Blob | string>) => {
    if (typeof event.data !== 'string') {
      handlers.onFrame(event.data);
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    const kind = (message as { type?: unknown })?.type;
    if (kind === 'state') {
      const parsed = browserLiveStateSchema.safeParse(message);
      if (parsed.success) handlers.onState(parsed.data);
      return;
    }
    if (kind === 'ignored' || kind === 'error') {
      const { reason, detail } = message as { reason?: string; detail?: string };
      handlers.onNotice?.(String(reason ?? kind), detail);
    }
  });
  socket.addEventListener('close', (event) => handlers.onClose(event.code, event.reason));
  return {
    send: (input) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(input));
    },
    close: () => socket.close(1000, 'closed'),
  };
}
