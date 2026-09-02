import {
  A2UI_VERSION,
  PROTOCOL_VERSION,
  TransportError,
  type ClioTransport,
  type StreamScope,
  type TransportFrame,
  type TransportRequest,
} from '@clio/core/v3';

const GACT_ACCEPT = PROTOCOL_VERSION;
const A2UI_ACCEPT = A2UI_VERSION;

export interface BrowserTransportOptions {
  endpoint: string;
  token?: string;
  fetcher?: typeof fetch;
  now?: () => string;
}

function endpointUrl(endpoint: string, path: string): string {
  const base = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
  return new URL(path.replace(/^\/+/, ''), base).toString();
}

function eventBoundary(buffer: string): { end: number; next: number } | undefined {
  const candidates = [
    { index: buffer.indexOf('\r\n\r\n'), length: 4 },
    { index: buffer.indexOf('\n\n'), length: 2 },
    { index: buffer.indexOf('\r\r'), length: 2 },
  ].filter((candidate) => candidate.index >= 0);
  candidates.sort((left, right) => left.index - right.index);
  const first = candidates[0];
  return first ? { end: first.index, next: first.index + first.length } : undefined;
}

function parseEventBlock(
  block: string,
): { cursor: string; eventName: string; data: unknown } | undefined {
  let cursor = '';
  let eventName = 'message';
  const data: string[] = [];

  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(':')) continue;
    const separator = rawLine.indexOf(':');
    const field = separator < 0 ? rawLine : rawLine.slice(0, separator);
    const rawValue = separator < 0 ? '' : rawLine.slice(separator + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'id') cursor = value;
    if (field === 'event') eventName = value;
    if (field === 'data') data.push(value);
  }

  if (data.length === 0) return undefined;
  return { cursor, eventName, data: JSON.parse(data.join('\n')) as unknown };
}

export class BrowserClioTransport implements ClioTransport {
  private readonly endpoint: string;
  private readonly token?: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => string;

  public constructor(options: BrowserTransportOptions) {
    this.endpoint = options.endpoint;
    this.token = options.token;
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  public async request<T>(request: TransportRequest<T>): Promise<T> {
    const headers = this.headers('application/json');
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      headers.set(name, value);
    }
    const rawBody = request.rawBody
      ? Uint8Array.from(request.rawBody).buffer
      : undefined;
    let response: Response;
    try {
      response = await this.fetcher(endpointUrl(this.endpoint, request.path), {
        method: request.method,
        signal: request.signal,
        headers,
        body:
          rawBody ??
          (request.body === undefined ? undefined : JSON.stringify(request.body)),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new TransportError(
        `Unable to reach the service at ${this.endpoint}`,
        undefined,
        'network_unavailable',
      );
    }
    if (!response.ok) {
      const error = await decodeErrorResponse(response);
      throw new TransportError(
        error.message || `Request failed with ${response.status} ${response.statusText}`,
        response.status,
        error.code,
        error.details,
      );
    }
    const value =
      response.status === 204
        ? undefined
        : request.responseType === 'text'
          ? await response.text()
          : request.responseType === 'bytes'
            ? new Uint8Array(await response.arrayBuffer())
            : ((await response.json()) as unknown);
    return request.decode(value);
  }

  public async *stream(
    scope: StreamScope,
    cursor?: string,
    signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    const path = scope.session_id
      ? `/v1/sessions/${encodeURIComponent(scope.session_id)}/events`
      : '/v1/events';
    const headers = this.headers('text/event-stream');
    if (cursor) headers.set('Last-Event-ID', cursor);

    let response: Response;
    try {
      response = await this.fetcher(endpointUrl(this.endpoint, path), { headers, signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new TransportError(
        `Unable to reach the service at ${this.endpoint}`,
        undefined,
        'network_unavailable',
      );
    }
    if (!response.ok || !response.body) {
      throw new TransportError(
        `Live connection failed with ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let readerCancelled = false;
    const cancelReader = () => {
      if (readerCancelled) return;
      readerCancelled = true;
      void reader.cancel().catch(() => {
        // The fetch may reject the reader before cancellation settles. The
        // caller's AbortSignal remains the authoritative shutdown reason.
      });
    };
    signal?.addEventListener('abort', cancelReader, { once: true });
    try {
      if (signal?.aborted) {
        cancelReader();
        throw new DOMException('The operation was aborted', 'AbortError');
      }
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let boundary = eventBoundary(buffer);
        while (boundary) {
          const event = parseEventBlock(buffer.slice(0, boundary.end));
          buffer = buffer.slice(boundary.next);
          if (event) {
            yield {
              cursor: event.cursor,
              eventName: event.eventName,
              data: event.data,
              receivedAt: this.now(),
            };
          }
          boundary = eventBoundary(buffer);
        }
      }
    } finally {
      signal?.removeEventListener('abort', cancelReader);
      cancelReader();
      reader.releaseLock();
    }
  }

  private headers(accept: string): Headers {
    const headers = new Headers({
      Accept: accept,
      'Content-Type': 'application/json',
      'X-GACT-Version': GACT_ACCEPT,
      'X-A2UI-Version': A2UI_ACCEPT,
    });
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    return headers;
  }
}

async function decodeErrorResponse(
  response: Response,
): Promise<{ code?: string; message?: string; details?: unknown }> {
  try {
    const value = (await response.clone().json()) as {
      error?: { error?: unknown; message?: unknown; details?: unknown };
    };
    const envelope = value.error;
    if (!envelope || typeof envelope !== 'object') return {};
    return {
      code: typeof envelope.error === 'string' ? envelope.error : undefined,
      message: typeof envelope.message === 'string' ? envelope.message : undefined,
      details: envelope.details,
    };
  } catch {
    return {};
  }
}
