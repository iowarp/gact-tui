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

    await expect(
      new ClioRepository(transport).executionProvenance('sess_1'),
    ).resolves.toMatchObject({
      campaigns: [{ campaign_id: 'campaign_1' }],
      workflows: [{ workflow_id: 'workflow_1' }],
    });
  });

  it('preserves authoritative child ownership, task paths, and typed causal edges', async () => {
    const transport = new RecordingTransport([
      {
        schema_version: 'clio.execution_provenance.v1',
        provider: 'native',
        session_id: 'sess_root',
        root_session_id: 'sess_root',
        complete: true,
        truncated: false,
        provider_health: {},
        campaigns: [],
        workflows: [],
        agents: [],
        session_lineage: [
          {
            session_id: 'sess_child',
            parent_session_id: 'sess_root',
            task_id: 'task_child',
            agent_id: 'researcher',
            label: 'Evidence researcher',
            depth: 1,
            task_path: ['task_child'],
          },
        ],
        spans: [
          {
            id: 'artifact_event',
            parent_id: '',
            kind: 'artifact',
            session_id: 'sess_child',
            root_session_id: 'sess_root',
            owner_session_id: 'sess_child',
            workflow_id: '',
            campaign_id: '',
            agent_id: 'researcher',
            source_agent_id: '',
            task_id: 'task_child',
            task_path: ['task_child'],
            label: 'Produced evidence',
            event_type: 'artifact.created',
            status: 'completed',
            start_time: 1,
            end_time: 1,
            duration_ms: 0,
            host: '',
            artifact_refs: [{ artifact_id: 'artifact_1', sha256: 'abc' }],
            attributes: {},
            source_event_ids: ['event_1'],
          },
        ],
        nodes: [],
        edges: [
          {
            id: 'generated:task:task_child->artifact:artifact_1',
            source: 'task:task_child',
            target: 'artifact:artifact_1',
            kind: 'generated',
            event_id: 'artifact_event',
          },
        ],
      },
    ]);

    const result = await new ClioRepository(transport).executionProvenance('sess_root');

    expect(result.session_lineage?.[0]).toMatchObject({
      session_id: 'sess_child',
      depth: 1,
      task_path: ['task_child'],
    });
    expect(result.spans[0]).toMatchObject({
      owner_session_id: 'sess_child',
      task_id: 'task_child',
      task_path: ['task_child'],
    });
    expect(result.edges[0]).toMatchObject({ kind: 'generated', event_id: 'artifact_event' });
  });
});
