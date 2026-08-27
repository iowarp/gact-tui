import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import { RecordingTransport } from './recording-transport.test-helper.js';

describe('ExecutionProvenanceRepository', () => {
  it('discovers execution and artifact provenance providers through CLIO', async () => {
    const transport = new RecordingTransport([
      {
        schema_version: 'clio.provenance_providers.v1',
        default_provider: 'native',
        providers: [
          {
            name: 'flowcept',
            configured: true,
            queryable: true,
            durable: false,
            status: 'ready',
            source: 'flowcept',
            health: { flush_durable: false },
          },
        ],
        artifact: {
          provider: 'cmf',
          queryable: true,
          durable: true,
          status: 'ready',
          health: {},
        },
      },
    ]);

    await expect(new ClioRepository(transport).provenanceProviders()).resolves.toMatchObject({
      providers: [{ name: 'flowcept', health: { flush_durable: false } }],
      artifact: { provider: 'cmf', status: 'ready' },
    });
    expect(transport.requests[0]?.path).toBe('/v1/provenance/providers');
  });

  it('queries the named provider with explicit tree and limit options', async () => {
    const transport = new RecordingTransport([
      {
        schema_version: 'clio.execution_provenance.v1',
        provider: 'flowcept',
        session_id: 'sess abc',
        complete: false,
        truncated: true,
        provider_health: { status: 'degraded' },
        campaigns: [],
        workflows: [],
        agents: [],
        spans: [],
        nodes: [],
        edges: [],
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(
      repository.executionProvenance('sess abc', {
        provider: 'flowcept',
        includeChildren: true,
        limit: 10_000,
      }),
    ).resolves.toMatchObject({ provider: 'flowcept', complete: false, truncated: true });
    expect(transport.requests[0]?.path).toBe(
      '/v1/sessions/sess%20abc/provenance/execution?provider=flowcept&include_children=true&limit=10000',
    );
  });

  it('rejects malformed provider snapshots instead of fabricating an empty graph', async () => {
    const transport = new RecordingTransport([
      {
        schema_version: 'clio.execution_provenance.v1',
        provider: 'flowcept',
        session_id: 'sess_1',
        complete: true,
        truncated: false,
      },
    ]);

    await expect(new ClioRepository(transport).executionProvenance('sess_1')).rejects.toThrow();
  });

  it('preserves provider-native campaign and workflow identities', async () => {
    const flowceptEntity = {
      workflow_id: 'workflow_1',
      campaign_id: 'campaign_1',
      name: 'CLIO session sess_1',
    };
    const transport = new RecordingTransport([
      {
        schema_version: 'clio.execution_provenance.v1',
        provider: 'flowcept',
        session_id: 'sess_1',
        complete: true,
        truncated: false,
        provider_health: { status: 'ready' },
        campaigns: [flowceptEntity],
        workflows: [flowceptEntity],
        agents: [],
        spans: [],
        nodes: [],
        edges: [],
      },
    ]);

    await expect(new ClioRepository(transport).executionProvenance('sess_1')).resolves.toMatchObject({
      campaigns: [{ campaign_id: 'campaign_1' }],
      workflows: [{ workflow_id: 'workflow_1' }],
    });
  });
});
