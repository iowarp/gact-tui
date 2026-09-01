import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';

class RunTransport implements ClioTransport {
  public readonly requests: TransportRequest<unknown>[] = [];

  public constructor(private readonly responses: unknown[]) {}

  public request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    return Promise.resolve(request.decode(this.responses.shift()));
  }

  public async *stream(
    _scope: StreamScope,
    _cursor?: string,
    _signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    return;
  }
}

describe('ClioRepository operational run actions', () => {
  it('uses the authoritative detach, dismiss, and child-agent cancellation routes', async () => {
    const transport = new RunTransport([
      {
        handle_id: 'handle 1',
        task_id: 'task 1',
        run_label: 'Remote analysis',
        live_state: 'running',
        status: 'running',
        host: 'ares',
        placement: 'relay',
        parent_session_id: 'session 1',
        created_at: '2026-08-22T00:00:00Z',
        updated_at: '2026-08-22T00:01:00Z',
        detached: true,
        source: 'relay_job',
        ticker: { state: 'running', updated_at: '2026-08-22T00:01:00Z' },
      },
      { dismissed: true, handle_id: 'handle 1' },
      { task_id: 'task 1', status: 'cancelled' },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.detachRun('handle 1')).resolves.toMatchObject({ detached: true });
    await repository.dismissRun('handle 1');
    await repository.cancelAgentTask('task 1');

    expect(transport.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'POST', path: '/v1/runs/handle%201/detach' },
      { method: 'POST', path: '/v1/runs/handle%201/dismiss' },
      { method: 'POST', path: '/v1/agent-tasks/task%201/cancel' },
    ]);
  });
});
