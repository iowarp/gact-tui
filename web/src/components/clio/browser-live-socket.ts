import {
  BROWSER_LIVE_PROTOCOL,
  browserLivePath,
  browserLiveStateSchema,
  type BrowserLiveState,
  type DocumentAnchor,
} from '@clio/core/v3';

/** What the person sends to the shared page, in page CSS pixels. */
export type BrowserInput =
  | {
      type: 'mouse';
      action: 'move' | 'down' | 'up' | 'click';
      x: number;
      y: number;
      button?: string;
      count?: number;
    }
  | { type: 'wheel'; dx: number; dy: number }
  | { type: 'key'; action: 'down' | 'up' | 'press'; key: string }
  | { type: 'text'; text: string }
  | { type: 'resize'; width: number; height: number }
  | { type: 'navigate'; action: 'goto' | 'back' | 'forward' | 'reload'; url?: string }
  | { type: 'theme'; accent: string }
  | { type: 'pick.start'; mode: 'element' | 'text' }
  | { type: 'pick.stop' }
  | { type: 'marks.watch'; marks: { label: string; anchor: DocumentAnchor }[] };

/** Where the page found one of the marks the view follows, in page CSS pixels. */
export interface LocatedMark {
  label: string;
  found: boolean;
  /** How it was found: its selector, image source, role and name, text, or quote. */
  how?: string;
  rect?: [number, number, number, number];
  /** The element's selector now, when the one it was picked with no longer names it. */
  selector?: string;
  /** A region's element the first time the page saw it: the region follows it from then on. */
  hold?: RegionHold;
  /** Why it was not found: gone, changed, or on the page but not shown. */
  reason?: string;
}

/** The page's report on the followed marks (the live socket's `marks` message). */
export interface MarksReport {
  url: string;
  viewport: { width: number; height: number };
  marks: LocatedMark[];
}

function numbers(value: unknown, count: number): number[] | null {
  return Array.isArray(value) &&
    value.length === count &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
    ? (value as number[])
    : null;
}

/** The element a region holds to, and the region's offset and size from it in CSS pixels. */
export interface RegionHold {
  selector: string;
  tag: string;
  dx: number;
  dy: number;
  width: number;
  height: number;
}

function regionHold(value: unknown): RegionHold | undefined {
  const hold = (value ?? {}) as Record<string, unknown>;
  const size = numbers([hold.dx, hold.dy, hold.width, hold.height], 4);
  if (typeof hold.selector !== 'string' || !hold.selector || !size) return undefined;
  const [dx, dy, width, height] = size as [number, number, number, number];
  const tag = typeof hold.tag === 'string' ? hold.tag : '';
  return { selector: hold.selector, tag, dx, dy, width, height };
}

/** A `marks` message as a report, or `null` when it is malformed. */
export function parseMarksReport(message: unknown): MarksReport | null {
  const { url, viewport, marks } = (message ?? {}) as Record<string, unknown>;
  const size = numbers(viewport, 2);
  if (typeof url !== 'string' || !size || !Array.isArray(marks)) return null;
  const located: LocatedMark[] = [];
  for (const raw of marks) {
    const item = (raw ?? {}) as Record<string, unknown>;
    if (typeof item.label !== 'string') continue;
    const rect = numbers(item.rect, 4);
    located.push({
      label: item.label,
      found: item.found === true && rect !== null,
      how: typeof item.how === 'string' ? item.how : undefined,
      rect: rect ? (rect as [number, number, number, number]) : undefined,
      selector: typeof item.selector === 'string' ? item.selector : undefined,
      hold: regionHold(item.hold),
      reason: typeof item.reason === 'string' ? item.reason : undefined,
    });
  }
  return { url, viewport: { width: size[0]!, height: size[1]! }, marks: located };
}

export interface BrowserLiveHandlers {
  onFrame: (frame: Blob) => void;
  onState: (state: BrowserLiveState) => void;
  /** The server said why it ignored or rejected an input (view only, a bad message). */
  onNotice?: (reason: string, detail?: string) => void;
  /** An element or text the person picked while a comment pick was active (a `dom` or
   * `text-quote` anchor, checked by the caller). */
  onPick?: (anchor: unknown) => void;
  /** Where the page found the marks this view follows (`marks.watch`). */
  onMarks?: (report: MarksReport) => void;
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
    if (kind === 'pick') {
      handlers.onPick?.((message as { anchor?: unknown }).anchor);
      return;
    }
    if (kind === 'marks') {
      const report = parseMarksReport(message);
      if (report) handlers.onMarks?.(report);
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
