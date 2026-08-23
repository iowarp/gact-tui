import { describe, expect, it } from 'vitest';
import type {
  ClioTransport,
  StreamScope,
  TransportFrame,
  TransportRequest,
} from './transport.js';
import { ClioRepository } from './repository.js';

class RecordingTransport implements ClioTransport {
  public readonly requests: TransportRequest<unknown>[] = [];

  public constructor(private readonly responses: unknown[]) {}

  public async request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    const value = this.responses.shift();
    return request.decode(value);
  }

  public async *stream(
    _scope: StreamScope,
    _cursor?: string,
    _signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    return;
  }
}

describe('SessionObservabilityRepository diff mutations', () => {
  it('applies and rejects only the explicitly selected server paths', async () => {
    const transport = new RecordingTransport([
      { applied: ['src/analysis.py'] },
      { rejected: ['notes/draft.md'] },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.applySessionDiffs('sess 1', ['src/analysis.py'])).resolves.toEqual({
      applied: ['src/analysis.py'],
    });
    await expect(repository.rejectSessionDiffs('sess 1', ['notes/draft.md'])).resolves.toEqual({
      rejected: ['notes/draft.md'],
    });

    expect(
      transport.requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      {
        method: 'POST',
        path: '/v1/sessions/sess%201/diffs/apply',
        body: { paths: ['src/analysis.py'] },
      },
      {
        method: 'POST',
        path: '/v1/sessions/sess%201/diffs/reject',
        body: { paths: ['notes/draft.md'] },
      },
    ]);
  });

  it('preserves per-path write failures from the server', async () => {
    const transport = new RecordingTransport([
      {
        applied: [],
        write_errors: { 'src/analysis.py': 'permission denied' },
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.applySessionDiffs('sess', ['src/analysis.py'])).resolves.toEqual({
      applied: [],
      write_errors: { 'src/analysis.py': 'permission denied' },
    });
  });
});
