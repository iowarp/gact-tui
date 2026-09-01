import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';

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

const pack = {
  id: 'earth-data',
  version: '1.2.0',
  title: 'Earth data experts',
  description: 'Coordinates grounded data discovery.',
  scope: 'workspace',
  enabled: true,
  validation_errors: [],
  kind: 'pack',
};

const agent = {
  id: 'catalog-reviewer',
  title: 'Catalog reviewer',
  source: 'expert_pack',
  enabled: true,
  validation_errors: [],
};

describe('expert pack repository', () => {
  it('uses the pack-specific discovery, detail, validation, and lifecycle routes', async () => {
    const transport = new RecordingTransport([
      { expert_packs: [pack] },
      { expert_pack: pack, agents: [agent] },
      { pack, agents: [agent], enabled: true, validation_errors: [] },
      { installed: [pack] },
      { updated: pack },
      undefined,
    ]);
    const repository = new ClioRepository(transport);

    await repository.expertPacks('ws science');
    await repository.expertPack('earth/data', 'ws science');
    await repository.validateExpertPack({ path: 'D:\\packs\\earth', scope: 'workspace' });
    await repository.installExpertPack({
      source_id: 'src-market',
      pack_id: 'earth-data',
      scope: 'workspace',
      workspace_id: 'ws science',
    });
    await repository.updateExpertPack('earth/data', {
      scope: 'workspace',
      workspace_id: 'ws science',
    });
    await repository.deleteExpertPack('earth/data', {
      scope: 'workspace',
      workspace_id: 'ws science',
    });

    expect(transport.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'GET', path: '/v1/expert-packs?workspace_id=ws%20science' },
      { method: 'GET', path: '/v1/expert-packs/earth%2Fdata?workspace_id=ws%20science' },
      { method: 'POST', path: '/v1/expert-packs/validate' },
      { method: 'POST', path: '/v1/expert-packs/install' },
      { method: 'POST', path: '/v1/expert-packs/earth%2Fdata/update' },
      {
        method: 'DELETE',
        path: '/v1/expert-packs/earth%2Fdata?scope=workspace&workspace_id=ws+science',
      },
    ]);
    expect(transport.requests[3]?.body).toEqual({
      source_id: 'src-market',
      blueprint_id: 'earth-data',
      scope: 'workspace',
      workspace_id: 'ws science',
    });
  });
});
