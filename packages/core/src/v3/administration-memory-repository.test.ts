import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';

class RecordingTransport implements ClioTransport {
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
    yield* [];
  }
}

describe('memory administration repository', () => {
  it('creates explicit memory and reads paged creation attempts without inventing unknown usage', async () => {
    const memory = {
      name: 'project/ws_lab/preferences/report-style',
      scope: 'project/ws_lab',
      category: 'preferences',
      slug: 'report-style',
      description: 'Report style',
      aliases: [],
      updated: '2026-10-25',
      sha: 'a'.repeat(64),
      text: 'saved',
      forgotten: [],
      facts: [],
    };
    const run = {
      id: 'mr_1',
      origin: 'session:sess_1',
      source_session: 'sess_1',
      curator_session: '',
      handle: '',
      state: 'failed',
      reason: 'memory_extract_failed',
      started_at: '2026-10-25T10:00:00Z',
      completed_at: '2026-10-25T10:00:04Z',
      models: {
        extract: { provider_id: 'codex', model_id: 'test-model', source: 'fleet' },
        curator: null,
      },
      usage: { input_tokens: null, output_tokens: null, cost_usd: null, cost_known: false },
      extract: null,
      proposal_counts: { accepted: 0, pending: 0, rejected: 0 },
    };
    const transport = new RecordingTransport([
      memory,
      {
        runs: [run],
        next_cursor: 'earlier',
        background: { last_tick: '2026-10-25T10:00:00Z', skipped: { not_idle_yet: 1 } },
      },
      { runs: [], next_cursor: null, background: null },
    ]);
    const repository = new ClioRepository(transport);
    const input = {
      scope: 'project/ws_lab',
      category: 'preferences' as const,
      slug: 'report-style',
      description: 'Report style',
      facts: ['Use SI units.'],
    };
    expect(await repository.createMemoryDocument(input)).toEqual(memory);
    const page = await repository.memoryCreationRuns();
    expect(page.runs[0]?.usage.cost_usd).toBeNull();
    expect(page.runs[0]?.models.curator).toBeNull();
    expect(page.background?.skipped).toEqual({ not_idle_yet: 1 });
    await repository.memoryCreationRuns(page.next_cursor!);
    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: 'POST', path: '/v1/memory/documents', body: input },
      { method: 'GET', path: '/v1/memory/creation-runs?limit=50', body: undefined },
      { method: 'GET', path: '/v1/memory/creation-runs?limit=50&cursor=earlier', body: undefined },
    ]);
  });

  it('decodes session retention and its bounded compaction history', async () => {
    const event = {
      id: 'mem_1',
      version: 1,
      type: 'compact_summary',
      session_id: 'sess_1',
      created_at: '2026-08-23T00:00:00Z',
      updated_at: '2026-08-23T00:00:00Z',
      summary_message_id: 'msg_1',
      archived_count: 8,
      summary_chars: 300,
      transcript_chars: 2400,
      focus: 'Keep the campaign evidence and next action.',
      arc_status: 'stored',
      metadata: { source: 'gact_compact' },
    };
    const transport = new RecordingTransport([
      {
        cache: { hits: 2, misses: 1, hit_rate: 2 / 3, capacity: 1000 },
        session: {
          session_id: 'sess_1',
          messages_retained: 8,
          tokens_retained: 1200,
          tokens_budget: 8000,
          context_files_attached: 2,
          context_files_by_mode: { read: 2 },
          compact_summaries: 1,
          token_pressure: 0.15,
          threshold_state: 'normal',
          compaction_recommended: false,
        },
        global: { conversations_total: 4, invocations_total: 9 },
        metadata: {},
      },
      { events: [event] },
      { event },
    ]);
    const repository = new ClioRepository(transport);

    expect((await repository.memoryStatistics(undefined, 'sess_1')).session?.tokens_retained).toBe(
      1200,
    );
    expect((await repository.memoryEvents('sess_1', 500))[0]?.summary_message_id).toBe('msg_1');
    expect((await repository.memoryEvent('sess_1', 'mem_1')).focus).toContain('evidence');
    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/v1/memory/stats?session_id=sess_1',
      '/v1/sessions/sess_1/memory/events?limit=200',
      '/v1/sessions/sess_1/memory/events/mem_1',
    ]);
  });
});

it('retains the original proposal and actual applied correction independently', async () => {
  const proposed = { id: 'purple', kind: 'updated', before: 'green', after: 'purple' };
  const applied = { id: 'violet', kind: 'updated', before: 'green', after: 'violet' };
  const row = {
    id: 'p',
    target: 'project/lab/topics/colors',
    change: 'supersede',
    facts: ['violet'],
    replaces: ['green'],
    merge_from: [],
    description: 'Colors',
    evidence: [],
    sources: ['user'],
    rationale: 'Correction',
    origin: 'session:s',
    handle: 'task',
    status: 'accepted',
    decided_by: 'user',
    created_at: '2026-10-25',
    decided_at: '2026-10-25',
    base_text: 'green',
    proposed_text: 'purple',
    needs_review: false,
    changes: [proposed],
    applied_changes: [applied],
    applied_before_text: 'green',
    applied_text: 'violet',
    target_label: 'Colors',
  };
  const repository = new ClioRepository(new RecordingTransport([{ proposals: [row] }]));
  const decoded = (await repository.memoryProposals('all'))[0]!;
  expect(decoded.changes).toEqual([proposed]);
  expect(decoded.applied_changes).toEqual([applied]);
  expect(decoded.proposed_text).toBe('purple');
  expect(decoded.applied_text).toBe('violet');
  expect(decoded.target_label).toBe('Colors');
});
