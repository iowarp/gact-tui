import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';

export class RecordingTransport implements ClioTransport {
  public readonly requests: TransportRequest<unknown>[] = [];

  public constructor(private readonly responses: unknown[]) {}

  public request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    const response = this.responses.shift();
    if (response instanceof Error) return Promise.reject(response);
    // A refused decode must REJECT, never throw synchronously out of the call:
    // the real transport decodes inside its own async chain, and a helper that
    // throws early hides every decode failure from `.rejects` assertions.
    try {
      return Promise.resolve(request.decode(response));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public async *stream(
    _scope: StreamScope,
    _cursor?: string,
    _signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    return;
  }
}
