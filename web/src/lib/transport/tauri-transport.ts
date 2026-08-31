import {
  A2UI_VERSION,
  PROTOCOL_VERSION,
  TransportError,
  type ClioTransport,
  type StreamScope,
  type TransportFrame,
  type TransportRequest,
} from '@clio/core/v3';

interface RustHttpResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  body_encoding?: 'text' | 'base64';
}

interface RustHttpRequestBody {
  body?: string;
  body_encoding?: 'text' | 'base64';
}

interface SseBridgeMessage {
  kind: 'open' | 'event' | 'error' | 'closed';
  data?: string;
  id?: string;
  message?: string;
}

interface SseBridgePayload {
  client_id: string;
  message: SseBridgeMessage;
}

interface TauriEvent<T> {
  payload: T;
}

export interface TauriBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (event: TauriEvent<T>) => void): Promise<() => void>;
}

const defaultBridge: TauriBridge = {
  invoke: async <T>(command: string, args?: Record<string, unknown>) => {
    const api = await import('@tauri-apps/api/core');
    return api.invoke<T>(command, args);
  },
  listen: async <T>(event: string, handler: (event: TauriEvent<T>) => void) => {
    const api = await import('@tauri-apps/api/event');
    return api.listen<T>(event, handler);
  },
};

export interface TauriTransportOptions {
  endpoint: string;
  token?: string;
  bridge?: TauriBridge;
  now?: () => string;
  clientId?: () => string;
}

function endpointUrl(endpoint: string, path: string): string {
  return new URL(path, endpoint.endsWith('/') ? endpoint : `${endpoint}/`).toString();
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError');
}

export class TauriClioTransport implements ClioTransport {
  private readonly endpoint: string;
  private readonly token?: string;
  private readonly bridge: TauriBridge;
  private readonly now: () => string;
  private readonly clientId: () => string;

  public constructor(options: TauriTransportOptions) {
    this.endpoint = options.endpoint;
    this.token = options.token;
    this.bridge = options.bridge ?? defaultBridge;
    this.now = options.now ?? (() => new Date().toISOString());
    this.clientId =
      options.clientId ??
      (() => `clio-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`);
  }

  public async request<T>(request: TransportRequest<T>): Promise<T> {
    if (request.signal?.aborted) throw abortError();
    const requestBody = encodeRequestBody(request);
    let response: RustHttpResponse;
    try {
      response = await this.bridge.invoke<RustHttpResponse>('gact_http', {
        req: {
          method: request.method,
          url: endpointUrl(this.endpoint, request.path),
          headers: {
            ...this.headers('application/json'),
            ...request.headers,
          },
          ...requestBody,
        },
      });
    } catch (error) {
      if (request.signal?.aborted) throw abortError();
      throw new TransportError(
        error instanceof Error ? error.message : 'Native request failed',
        undefined,
        'native_transport_failed',
      );
    }
    if (request.signal?.aborted) throw abortError();
    if (response.status < 200 || response.status >= 300) {
      const error = decodeErrorBody(decodeResponseText(response));
      throw new TransportError(
        error.message || `Request failed with ${response.status} ${response.status_text}`,
        response.status,
        error.code,
        error.details,
      );
    }
    const value =
      response.status === 204 || response.body === ''
        ? undefined
        : request.responseType === 'bytes'
          ? decodeResponseBytes(response)
          : request.responseType === 'text'
            ? decodeResponseText(response)
            : JSON.parse(decodeResponseText(response));
    return request.decode(value);
  }

  public async *stream(
    scope: StreamScope,
    cursor?: string,
    signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    if (signal?.aborted) throw abortError();
    const path = scope.session_id
      ? `/v1/sessions/${encodeURIComponent(scope.session_id)}/events`
      : '/v1/events';
    const url = endpointUrl(this.endpoint, path);
    const clientId = this.clientId();
    const queued: TransportFrame[] = [];
    let wake: (() => void) | undefined;
    let failure: Error | undefined;
    let closed = false;
    let streamId: number | undefined;

    const notify = () => {
      wake?.();
      wake = undefined;
    };
    const unlisten = await this.bridge.listen<SseBridgePayload>('gact:sse', (event) => {
      if (event.payload.client_id !== clientId) return;
      const message = event.payload.message;
      if (message.kind === 'event' && message.data !== undefined) {
        try {
          const data = JSON.parse(message.data) as unknown;
          const eventName =
            data &&
            typeof data === 'object' &&
            typeof (data as { type?: unknown }).type === 'string'
              ? (data as { type: string }).type
              : '';
          if (!eventName) throw new Error('Native SSE frame has no event type');
          queued.push({
            cursor: message.id ?? '',
            eventName,
            data,
            receivedAt: this.now(),
          });
        } catch (error) {
          failure = error instanceof Error ? error : new Error('Native SSE frame is invalid');
        }
      } else if (message.kind === 'error') {
        failure = new TransportError(
          message.message ?? 'Native live connection failed',
          undefined,
          'native_stream_failed',
        );
      } else if (message.kind === 'closed') {
        closed = true;
      }
      notify();
    });

    const onAbort = () => {
      closed = true;
      notify();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      streamId = await this.bridge.invoke<number>('gact_sse_open', {
        url,
        headers: this.headers('text/event-stream', cursor),
        clientId,
      });
      for (;;) {
        if (signal?.aborted) throw abortError();
        if (failure) throw failure;
        const frame = queued.shift();
        if (frame) {
          yield frame;
          continue;
        }
        if (closed) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      signal?.removeEventListener('abort', onAbort);
      unlisten();
      if (streamId !== undefined) void this.bridge.invoke('gact_sse_close', { id: streamId });
    }
  }

  private headers(accept: string, cursor?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: accept,
      'Content-Type': 'application/json',
      'X-GACT-Version': PROTOCOL_VERSION,
      'X-A2UI-Version': A2UI_VERSION,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (cursor) headers['Last-Event-ID'] = cursor;
    return headers;
  }
}

function encodeRequestBody(request: TransportRequest<unknown>): RustHttpRequestBody {
  if (request.rawBody) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < request.rawBody.length; offset += chunkSize) {
      binary += String.fromCharCode(...request.rawBody.subarray(offset, offset + chunkSize));
    }
    return { body: globalThis.btoa(binary), body_encoding: 'base64' };
  }
  if (request.body === undefined) return {};
  return { body: JSON.stringify(request.body), body_encoding: 'text' };
}

function decodeResponseBytes(response: RustHttpResponse): Uint8Array {
  if (response.body_encoding !== 'base64') return new TextEncoder().encode(response.body);
  const binary = globalThis.atob(response.body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeResponseText(response: RustHttpResponse): string {
  if (response.body_encoding !== 'base64') return response.body;
  return new TextDecoder().decode(decodeResponseBytes(response));
}

function decodeErrorBody(body: string): { code?: string; message?: string; details?: unknown } {
  try {
    const value = JSON.parse(body) as {
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
