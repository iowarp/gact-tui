export interface TransportRequest<T> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  responseType?: 'json' | 'text' | 'bytes';
  decode: (value: unknown) => T;
  signal?: AbortSignal;
}

export interface StreamScope {
  connection_id: string;
  workspace_id?: string;
  session_id?: string;
  run_id?: string;
}

export interface TransportFrame {
  cursor: string;
  eventName: string;
  data: unknown;
  receivedAt: string;
}

export interface ClioTransport {
  request<T>(request: TransportRequest<T>): Promise<T>;
  stream(scope: StreamScope, cursor?: string, signal?: AbortSignal): AsyncIterable<TransportFrame>;
}

export class TransportError extends Error {
  public constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}
