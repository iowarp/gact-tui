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
    return;
  }
}

describe('memory administration repository', () => {
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
