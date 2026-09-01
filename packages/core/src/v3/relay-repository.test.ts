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

const relayStatus = {
  configured: true,
  host: 'relay.lan',
  mcp_url: 'http://relay.lan:18783/mcp',
  http_url: 'http://relay.lan:8765',
  credential_configured: true,
  configuration_scope: 'agent_run',
  can_manage: true,
  reachable: true,
  checked_at: '2026-08-24T12:00:00Z',
  reason: null,
  details: {},
};

describe('relay repository', () => {
  it('uses the runtime configuration routes without projecting credentials', async () => {
    const transport = new RecordingTransport([relayStatus, { ...relayStatus, configured: false }]);
    const repository = new ClioRepository(transport);

    const configured = await repository.configureRelay({
      mcp_url: 'http://relay.lan:18783/mcp',
      http_url: 'http://relay.lan:8765',
      access_token: 'secret',
    });
    await repository.disconnectRelay();

    expect(configured.configuration_scope).toBe('agent_run');
    expect(transport.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'PUT', path: '/v1/relay/configuration' },
      { method: 'DELETE', path: '/v1/relay/configuration' },
    ]);
    expect(transport.requests[0]?.body).toEqual({
      mcp_url: 'http://relay.lan:18783/mcp',
      http_url: 'http://relay.lan:8765',
      access_token: 'secret',
    });
    expect(configured).not.toHaveProperty('access_token');
  });
});
