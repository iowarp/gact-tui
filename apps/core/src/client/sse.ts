import type { GactEvent } from '../wire/events.js';

export type SseHandler = (event: GactEvent) => void;

export function sessionSseUrl(
  baseUrl: string,
  sessionId: string,
  bearerToken?: string,
): string {
  const u = new URL(`${baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/events`);
  if (bearerToken) {
    u.searchParams.set('auth_token', bearerToken);
  }
  return u.toString();
}

/**
 * Parse a single SSE block (events terminated by a blank line) into a typed
 * GactEvent envelope, or null if the block is incomplete / malformed.
 *
 * Only used in tests and any future Node-side consumer; the browser uses
 * `EventSource` directly. Reflects SPEC §7.2 — the `data:` line carries a
 * JSON object with `{type, occurred_at, payload}` keys; we return it
 * verbatim (no spreading), so consumers read `ev.payload.<field>`.
 */
export function parseSseBlock(block: string): GactEvent | null {
  let eventType: string | undefined;
  const dataLines: string[] = [];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line) continue;
    if (line.startsWith(':')) continue; // comment
    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }
  if (!eventType || dataLines.length === 0) return null;
  try {
    const env = JSON.parse(dataLines.join('\n')) as {
      type?: string;
      occurred_at?: string;
      payload?: unknown;
    };
    // The `event:` header and `data.type` are redundant on purpose (per
    // SPEC §7.2). Prefer `data.type` when present, fall back to the
    // header. Reject if both are missing.
    const innerType = env?.type ?? eventType;
    if (typeof innerType !== 'string') return null;
    if (typeof env?.occurred_at !== 'string') return null;
    return {
      type: innerType,
      occurred_at: env.occurred_at,
      payload: env.payload ?? {},
    } as unknown as GactEvent;
  } catch {
    return null;
  }
}

/** The raw fields of one SSE event block, per the WHATWG parsing rules. */
export interface SseFields {
  /** Accumulated `data:` payload (multiple lines joined with `\n`). */
  data: string;
  /** The `id:` value, if the event carried one. */
  id?: string;
  /** The `event:` name, if the event carried one. */
  event?: string;
}

/**
 * Parse a single SSE block into its raw fields using the WHATWG rules: split
 * each line at the first colon, strip one optional leading space from the
 * value, accumulate `data` lines with `\n` joins, and capture `id:`/`event:`.
 * Returns null for a block with no `data` field (comment- or metadata-only).
 *
 * Unlike {@link parseSseBlock}, this does not JSON-decode or reshape into a
 * `GactEvent`; it is the sibling used by the streaming reader (which needs the
 * `id:` for `Last-Event-ID` resume) and by the shared parser fixture tests.
 */
export function parseSseFields(block: string): SseFields | null {
  let id: string | undefined;
  let event: string | undefined;
  const dataLines: string[] = [];
  let haveData = false;
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '');
    if (line === '') continue;
    if (line.startsWith(':')) continue; // comment
    const colon = line.indexOf(':');
    let field: string;
    let value: string;
    if (colon === -1) {
      field = line;
      value = '';
    } else {
      field = line.slice(0, colon);
      value = line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
    }
    switch (field) {
      case 'id':
        id = value;
        break;
      case 'event':
        event = value;
        break;
      case 'data':
        dataLines.push(value);
        haveData = true;
        break;
      default:
        break; // retry, vendor extensions, etc. — ignored
    }
  }
  if (!haveData) return null;
  return { data: dataLines.join('\n'), id, event };
}

export interface SseFetchStreamOptions {
  /** Absolute SSE URL (any `auth_token` query param stays intact). */
  url: string;
  /** Echoed as the `Last-Event-ID` request header for resume. */
  lastEventId?: string;
  /** Extra request headers (e.g. Authorization). */
  headers?: Record<string, string>;
  onOpen: () => void;
  /** One decoded SSE event: raw `data:` payload plus its `id:` if present. */
  onData: (data: string, id?: string) => void;
  /** Called on transport failure or when the stream ends. */
  onError: (err?: unknown) => void;
}

export interface SseFetchStream {
  close: () => void;
}

/** Find the earliest SSE event boundary (blank line) in `buffer`. */
function findEventBoundary(buffer: string): { blockEnd: number; next: number } | null {
  const candidates = [
    { i: buffer.indexOf('\r\n\r\n'), len: 4 },
    { i: buffer.indexOf('\n\n'), len: 2 },
    { i: buffer.indexOf('\r\r'), len: 2 },
  ]
    .filter((c) => c.i !== -1)
    .sort((a, b) => a.i - b.i);
  const first = candidates[0];
  if (!first) return null;
  return { blockEnd: first.i, next: first.i + first.len };
}

/**
 * Open an SSE stream with a `fetch`/`ReadableStream` reader instead of the
 * native `EventSource`. Unlike `EventSource`, this can set the `Last-Event-ID`
 * header, which clio reads as the resume cursor (it has no query-param alias).
 * It surfaces every event's `id:` through {@link SseFetchStreamOptions.onData}
 * so the caller can echo the last seen id on reconnect.
 *
 * This is a pure transport: it performs no dedup or validity filtering — replay
 * integrity is the server's responsibility.
 */
export function openSseFetchStream(options: SseFetchStreamOptions): SseFetchStream {
  const controller = new AbortController();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    controller.abort();
  };

  void (async () => {
    try {
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        ...(options.headers ?? {}),
      };
      if (options.lastEventId) headers['Last-Event-ID'] = options.lastEventId;

      const resp = await fetch(options.url, { headers, signal: controller.signal });
      if (!resp.ok || !resp.body) {
        if (!closed) options.onError(new Error(`sse status ${resp.status}`));
        return;
      }
      options.onOpen();

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = findEventBoundary(buffer);
        while (boundary) {
          const block = buffer.slice(0, boundary.blockEnd);
          buffer = buffer.slice(boundary.next);
          const fields = parseSseFields(block);
          if (fields) options.onData(fields.data, fields.id);
          boundary = findEventBoundary(buffer);
        }
      }
      // Clean end of stream is still a disconnect the caller must react to.
      if (!closed) options.onError();
    } catch (err) {
      // AbortError from close() is expected; swallow it.
      if (!closed) options.onError(err);
    }
  })();

  return { close };
}
