import { describe, expect, it } from 'vitest';
import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';
import { ClioRepository } from './repository.js';

class RecordingTransport implements ClioTransport {
  public readonly requests: TransportRequest<unknown>[] = [];

  public constructor(private readonly responses: unknown[]) {}

  public async request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    return request.decode(this.responses.shift());
  }

  public async *stream(
    _scope: StreamScope,
    _cursor?: string,
    _signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    return;
  }
}

const server = {
  id: 'lm_studio',
  preset_id: 'lm_studio',
  label: 'LM Studio',
  address: 'http://127.0.0.1:1235/v1',
  custom: false,
  check: {
    reachable: true,
    connectivity: 'ok',
    models: ['qwen3-8b'],
    error: '',
    checked_at: '2026-09-26T00:00:00Z',
  },
};

describe('saved servers repository', () => {
  it('lists, adds, updates, checks and removes through /v1/providers/servers', async () => {
    const transport = new RecordingTransport([
      { servers: [{ ...server, check: null }] },
      server,
      server,
      server,
      { removed: 'lm_studio' },
    ]);
    const repository = new ClioRepository(transport);

    const [listed] = await repository.savedServers(true);
    expect(listed?.check).toBeUndefined();
    await repository.addSavedServer({ address: '127.0.0.1:1235', preset_id: 'lm_studio' });
    const updated = await repository.updateSavedServer('lm_studio', { address: '127.0.0.1:1235' });
    expect(updated.check?.models).toEqual(['qwen3-8b']);
    await repository.checkSavedServer('lm_studio');
    await repository.removeSavedServer('lm_studio');

    expect(transport.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'GET', path: '/v1/providers/servers?check=true' },
      { method: 'POST', path: '/v1/providers/servers' },
      { method: 'PATCH', path: '/v1/providers/servers/lm_studio' },
      { method: 'POST', path: '/v1/providers/servers/lm_studio/check' },
      { method: 'DELETE', path: '/v1/providers/servers/lm_studio' },
    ]);
    expect(transport.requests[1]?.body).toEqual({ address: '127.0.0.1:1235', preset_id: 'lm_studio' });
  });
});
