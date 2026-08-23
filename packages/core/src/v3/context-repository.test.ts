import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import type { ClioTransport, TransportRequest } from './transport.js';

class RecordingTransport implements ClioTransport {
  public readonly requests: TransportRequest<unknown>[] = [];

  public async request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    const value = request.path.endsWith('/context/policy')
      ? {
          session_id: 'sess_1',
          memory_scope: 'session',
          writable_scope: 'session',
          cross_session_read_available: true,
          requires_user_consent: true,
          notes: ['Cross-session reads require user intent.'],
          metadata: { source: 'clio_backend_default' },
        }
      : {
          session_id: 'sess_1',
          scope: 'main',
          window_tokens: 922_000,
          live_tokens: 120,
          live_block_count: 1,
          tokens_by_kind: { message: 120 },
          categories: { conversation: 120 },
          segments: [{ id: 'segment_1', kind: 'message' }],
          render_text: 'Retained evidence',
          render_keys: { segment_1: true },
        };
    return request.decode(value);
  }

  public async *stream(): AsyncIterable<never> {}
}

describe('ContextRepository', () => {
  it('loads compartment policy and compacts the selected live scope', async () => {
    const transport = new RecordingTransport();
    const repository = new ClioRepository(transport);

    expect((await repository.contextPolicy('sess 1')).requires_user_consent).toBe(true);
    expect((await repository.compactContext('sess 1', 'expert/main')).render_text).toBe(
      'Retained evidence',
    );
    expect(transport.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'GET', path: '/v1/sessions/sess%201/context/policy' },
      {
        method: 'POST',
        path: '/v1/sessions/sess%201/context/compact?scope=expert%2Fmain',
      },
    ]);
  });
});
