import { describe, expect, it } from 'vitest';
import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';
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

    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
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

describe('SessionObservabilityRepository agent tasks', () => {
  it('reads every registry task of a session, standing watchers included', async () => {
    const transport = new RecordingTransport([
      {
        tasks: [
          {
            task_id: 'task_watch',
            parent_session_id: 'sess 1',
            child_session_id: 'sess_watch',
            agent_ref: { expert_id: 'spotter_watcher', blueprint_id: 'spotter-ai' },
            run_index: 0,
            run_label: 'SPOTTER watcher',
            status: 'running',
            live_state: 'waiting',
            result: null,
            extra_field: 'kept out of the record',
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    const [watcher] = await repository.sessionAgentTasks('sess 1');

    expect(transport.requests[0]?.path).toBe('/v1/sessions/sess%201/agent-tasks');
    expect(watcher).toEqual({
      task_id: 'task_watch',
      parent_session_id: 'sess 1',
      child_session_id: 'sess_watch',
      parent_turn_id: '',
      expert_id: 'spotter_watcher',
      blueprint_id: 'spotter-ai',
      run_index: 0,
      run_label: 'SPOTTER watcher',
      status: 'running',
      live_state: 'waiting',
      error_reason: '',
      created_at: '',
      updated_at: '',
      answer_excerpt: '',
    });
  });
});
