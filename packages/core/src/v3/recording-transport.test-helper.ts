import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';

export class RecordingTransport implements ClioTransport {
  public readonly requests: TransportRequest<unknown>[] = [];

  public constructor(private readonly responses: unknown[]) {}

  public request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    const response = this.responses.shift();
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve(request.decode(response));
  }

  public async *stream(
    _scope: StreamScope,
    _cursor?: string,
    _signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    return;
  }
}
