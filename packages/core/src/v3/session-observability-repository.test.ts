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

describe('SessionObservabilityRepository diff undo', () => {
  it('reverts exactly the selected recorded change and decodes the settled row', async () => {
    const transport = new RecordingTransport([
      {
        reverted: {
          id: 'chg_1',
          path: 'src/analysis.py',
          status: 'reverted',
          created: false,
          undo_available: false,
          unified_diff: '@@ -1 +1 @@\n-old\n+new',
          reverted_at: '2026-10-23T00:00:00Z',
        },
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.revertSessionDiff('sess 1', 'chg_1')).resolves.toMatchObject({
      id: 'chg_1',
      status: 'reverted',
      undo_available: false,
    });

    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      {
        method: 'POST',
        path: '/v1/sessions/sess%201/diffs/revert',
        body: { id: 'chg_1' },
      },
    ]);
  });

  it('decodes a change whose undo is unavailable with its typed reason', async () => {
    const transport = new RecordingTransport([
      {
        diffs: [
          {
            id: 'chg_2',
            path: 'big.csv',
            status: 'applied',
            created: false,
            undo_available: false,
            undo_unavailable_reason: 'previous_content_too_large',
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.sessionDiffs('sess')).resolves.toEqual([
      expect.objectContaining({
        id: 'chg_2',
        undo_available: false,
        undo_unavailable_reason: 'previous_content_too_large',
      }),
    ]);
  });
});

describe('SessionObservabilityRepository agent tasks', () => {
  it('decodes shared native and Question tasks without dropping their handles or answers', async () => {
    const transport = new RecordingTransport([
      {
        processes: [
          {
            kind: 'question',
            id: 'question_1',
            handle: 'task_question',
            task_kind: 'Question',
            title: 'Which dataset?',
            live_state: 'input_required',
            status: 'pending',
            result: null,
          },
          {
            kind: 'question',
            id: 'question_2',
            handle: 'task_answer',
            task_kind: 'Question',
            title: 'Which model?',
            live_state: 'completed',
            status: 'answered',
            result: { answer: 'Luna' },
          },
          {
            kind: 'mcp',
            id: 'native_1',
            handle: 'task_native',
            task_kind: 'Shell',
            title: 'Check files',
            live_state: 'working',
            status: 'working',
            result: null,
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);
    const rows = await repository.asyncProcesses('sess');
    expect(rows.map(({ handle, live_state }) => [handle, live_state])).toEqual([
      ['task_question', 'waiting_user'],
      ['task_answer', 'completed'],
      ['task_native', 'running'],
    ]);
    expect(rows[1]?.result?.answer).toBe('Luna');
  });
  it('reads every registry task of a session, standing watchers included', async () => {
    const transport = new RecordingTransport([
      {
        tasks: [
          {
            task_id: 'task_watch',
            parent_session_id: 'sess 1',
            child_session_id: 'sess_watch',
            agent_ref: { expert_id: 'spotter_watcher' },
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
