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

const agent = {
  id: 'earthscope-reviewer',
  title: 'EarthScope Reviewer',
  description: 'Reviews station evidence.',
  source: 'user',
  enabled: true,
  validation_errors: [],
  system_prompt: 'Ground every claim.',
  default_provider: 'codex',
  default_model: 'gpt-5.6-luna',
  tools: ['geo_geocode'],
  skills: [],
  tier: 2,
};

describe('agent registry repository', () => {
  it('preserves full agent definitions across detail, create, update, and delete routes', async () => {
    const transport = new RecordingTransport([
      agent,
      agent,
      { ...agent, title: 'Reviewer' },
      undefined,
    ]);
    const repository = new ClioRepository(transport);
    const detail = await repository.agent('earthscope reviewer');
    await repository.createAgent(detail);
    await repository.updateAgent(detail.id, { ...detail, title: 'Reviewer' });
    await repository.deleteAgent(detail.id);

    expect(transport.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'GET', path: '/v1/agents/earthscope%20reviewer' },
      { method: 'POST', path: '/v1/agents' },
      { method: 'PUT', path: '/v1/agents/earthscope-reviewer' },
      { method: 'DELETE', path: '/v1/agents/earthscope-reviewer' },
    ]);
    expect(transport.requests[1]?.body).toMatchObject({
      system_prompt: 'Ground every claim.',
      default_model: 'gpt-5.6-luna',
      tools: ['geo_geocode'],
    });
  });
});
