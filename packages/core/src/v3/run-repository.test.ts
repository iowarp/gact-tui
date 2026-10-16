import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import type { ClioTransport, TransportRequest } from './transport.js';

class TaskTransport implements ClioTransport {
  readonly requests: TransportRequest<unknown>[] = [];
  constructor(private readonly responses: unknown[]) {}
  async request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    return request.decode(this.responses.shift());
  }
  async *stream() {}
}

function snapshot(kind = 'Shell', handle = 'opaque-task / 1') {
  return {
    schema_version: 1,
    handle,
    kind,
    owner: {
      human_id: 'human',
      session_id: 'session / one',
      assignment_id: 'assignment-one',
      parent_handle: null,
    },
    label: 'Accepted work',
    description: 'Original assignment',
    description_reference: null,
    description_missing: false,
    tool: 'builtin',
    invocation_id: 'invocation-one',
    status: 'active',
    raw_status: 'working',
    activity: 'executing',
    progress: { message: 'Working', completed: 3, total: 10, unit: 'files', output: null },
    supported_actions: ['observe', 'wait', 'cancel'],
    cancellation_requested_at: null,
    terminal_at: null,
    connection_freshness: 'fresh',
    settlement: 'unknown',
    recording: 'confirmed',
    created_at: '2026-10-15T01:00:00Z',
    updated_at: '2026-10-15T01:01:00Z',
    result: null,
    details: null,
    backend: null,
  };
}

describe('shared task repository', () => {
  it.each(['Session', 'Subagent', 'Shell', 'Download', 'Indexing', 'MCP', 'Question'])(
    'decodes the canonical %s snapshot without synthesizing settlement',
    async (kind) => {
      const transport = new TaskTransport([
        { tasks: [snapshot(kind)], total: 1, cursor: null, revision: 5 },
      ]);
      const page = await new ClioRepository(transport).queryTasks();
      expect(page.tasks[0]).toMatchObject({
        kind,
        handle: 'opaque-task / 1',
        raw_status: 'working',
        terminal_at: null,
        settlement: 'unknown',
        progress: { completed: 3, total: 10, unit: 'files' },
      });
      expect(transport.requests[0]?.method).toBe('GET');
      expect(transport.requests[0]?.body).toBeUndefined();
    },
  );

  it('preserves cross-session pagination and passes returned handles directly to cancellation', async () => {
    const second = {
      ...snapshot('Subagent', 'opaque-task-two'),
      owner: {
        human_id: 'human',
        session_id: 'session-two',
        assignment_id: 'assignment-two',
        parent_handle: null,
      },
    };
    const transport = new TaskTransport([
      { tasks: [snapshot()], total: 2, cursor: 'opaque / cursor', revision: 5 },
      { tasks: [second], total: 2, cursor: null, revision: 6 },
      {
        results: [
          { handle: second.handle, cancellation_requested: true, status: 'cancellation_requested' },
        ],
        errors: [],
      },
    ]);
    const repository = new ClioRepository(transport);
    const first = await repository.queryTasks({ limit: 1, activeOnly: true });
    const last = await repository.queryTasks({
      limit: 1,
      activeOnly: true,
      cursor: first.cursor ?? undefined,
    });
    await repository.cancelTasks(last.tasks[0]!.owner.session_id, [last.tasks[0]!.handle]);
    const url = new URL(transport.requests[1]!.path, 'https://service.test');
    expect(url.pathname).toBe('/v1/tasks/query');
    expect(url.searchParams.get('cursor')).toBe(first.cursor);
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('active_only')).toBe('true');
    expect(transport.requests[2]).toMatchObject({
      method: 'POST',
      path: '/v1/sessions/session-two/async-tasks/cancel',
      body: { tasks: ['opaque-task-two'] },
    });
  });

  it('reports partial cancellation failure without rewriting the successful member', async () => {
    const transport = new TaskTransport([
      {
        results: [
          { handle: 'good', cancellation_requested: true, status: 'cancellation_requested' },
        ],
        errors: [{ handle: 'missing', error: 'task unavailable' }],
      },
    ]);
    await expect(
      new ClioRepository(transport).cancelTasks('owner', ['good', 'missing']),
    ).rejects.toThrow('missing: task unavailable');
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.body).toEqual({ tasks: ['good', 'missing'] });
  });

  it('rejects a page whose task has no durable handle', async () => {
    const invalid: Record<string, unknown> = snapshot();
    delete invalid.handle;
    const transport = new TaskTransport([
      { tasks: [invalid], total: 1, cursor: null, revision: 5 },
    ]);
    await expect(new ClioRepository(transport).queryTasks()).rejects.toThrow();
  });
});
