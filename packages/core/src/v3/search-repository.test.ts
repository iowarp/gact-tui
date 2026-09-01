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

describe('SearchRepository', () => {
  it('keeps message, memory, and context search scoped and provenance-bearing', async () => {
    const transport = new RecordingTransport([
      {
        matches: [
          { message_id: 'msg_1', part_id: 'part_1', snippet: '…immutable evidence…', score: 1.2 },
        ],
      },
      {
        query: 'immutable evidence',
        include_cross_session: true,
        searched_sessions: ['sess_1'],
        hits: [
          {
            session_id: 'sess_1',
            session_title: 'Station review',
            workspace_id: 'ws_science',
            message_id: 'msg_1',
            role: 'assistant',
            created_at: '2026-08-23T12:00:00Z',
            text: 'The claim is anchored to immutable evidence.',
            score: 2.5,
            match_terms: ['immutable', 'evidence'],
            metadata: { source: 'transcript' },
          },
        ],
        metadata: { source: 'arc' },
      },
      {
        session_id: 'sess_1',
        query: 'station',
        semantic: true,
        hits: [{ scope: 'agents/station-review', score: 3.1 }],
      },
    ]);
    const repository = new ClioRepository(transport);

    expect(
      (await repository.searchSessionMessages('sess/1', 'immutable evidence'))[0],
    ).toMatchObject({ message_id: 'msg_1', part_id: 'part_1' });
    expect(
      (
        await repository.searchMemory('immutable evidence', {
          workspaceId: 'ws_science',
          includeCrossSession: true,
          limit: 12,
        })
      ).hits[0],
    ).toMatchObject({ session_title: 'Station review', role: 'assistant' });
    expect((await repository.searchContext('sess_1', 'station', { limit: 8 })).semantic).toBe(true);

    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/v1/sessions/sess%2F1/messages/search?q=immutable%20evidence',
      '/v1/memory/search?query=immutable+evidence&workspace_id=ws_science&include_cross_session=true&limit=12',
      '/v1/sessions/sess_1/context/search?q=station&k=8',
    ]);
  });
});
