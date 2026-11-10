import type {
  Artifact,
  AsyncProcess,
  ExecutionProvenanceResult,
  Message,
  WorkspaceResource,
} from '@clio/core/v3';
import { expect, it } from 'vitest';
import { formatBytes } from '@/lib/format';
import { sessionSources } from './observability-evidence-sources';

it('keeps a referenced artifact discoverable as an input without importing generated outputs', () => {
  const output: Artifact = {
    id: 'output',
    session_id: 's',
    name: 'report.docx',
    media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    uri: 'artifact://ws/report.docx@v1',
    session_relation: 'produced',
  };
  const input: Artifact = {
    ...output,
    id: 'input',
    name: 'source.docx',
    uri: 'artifact://ws/source.docx@v1',
    session_relation: 'used',
  };
  const sources = sessionSources([], [], [], undefined, [input, output]);
  expect(sources).toHaveLength(1);
  expect(sources[0]?.artifact).toEqual(input);
  expect(sources[0]?.label).toBe('source.docx');
});

it('retains the first recorded source/producer relation and keeps produced artifacts out of inputs', () => {
  const node = (
    id: string,
    kind: 'task' | 'resource' | 'artifact',
    label: string,
    attributes: Record<string, unknown> = {},
  ): ExecutionProvenanceResult['nodes'][number] => ({
    id,
    kind,
    label,
    attributes,
    session_id: 'session',
    agent_id: '',
    status: 'completed',
    start_time: null,
    end_time: null,
  });
  const provenance: ExecutionProvenanceResult = {
    schema_version: 'clio.execution_provenance.v1',
    provider: 'native',
    session_id: 'session',
    root_session_id: 'session',
    complete: true,
    truncated: false,
    provider_health: {},
    campaigns: [],
    workflows: [],
    agents: [],
    spans: [],
    session_lineage: [
      {
        session_id: 'session',
        parent_session_id: '',
        task_id: '',
        agent_id: '',
        label: 'Root',
        depth: 0,
        task_path: [],
      },
    ],
    nodes: [
      node('first', 'task', 'First actor'),
      node('second', 'task', 'Second actor'),
      node('input', 'resource', 'Original source', { url: 'https://primary.example/doc' }),
      node('output', 'artifact', 'report.md', { artifact_id: 'report' }),
    ],
    edges: [
      { id: 'used-first', source: 'second', target: 'input', kind: 'used' },
      { id: 'used-second', source: 'first', target: 'input', kind: 'used' },
      { id: 'generated-first', source: 'first', target: 'output', kind: 'generated' },
      { id: 'generated-second', source: 'second', target: 'output', kind: 'generated' },
    ],
  };
  const sources = sessionSources([], [], [], provenance);
  expect(sources).toHaveLength(1);
  expect(sources[0]).toMatchObject({
    value: 'https://primary.example/doc',
    ownerLabel: 'Second actor',
    relation: 'used',
  });
});

const resourceMessage = (
  messageId: string,
  resourceId: string,
  revision: string,
  name = `${resourceId}.csv`,
  mediaType = 'text/csv',
): Message => ({
  id: messageId,
  session_id: 'sess_1',
  role: 'user',
  created_at: '2026-08-31T00:00:00Z',
  blocks: [
    {
      id: `${messageId}_block`,
      type: 'resource',
      resource_id: resourceId,
      resource_revision: revision,
      workspace_id: 'ws_1',
      name,
      media_type: mediaType,
    },
  ],
});

const workspaceResource = (
  overrides: Partial<WorkspaceResource> & { id: string },
): WorkspaceResource => ({
  workspace_id: 'ws_1',
  client_upload_id: `${overrides.id}_upload`,
  revision: 1,
  name: overrides.id,
  claimed_mime: 'text/csv',
  detected_mime: 'text/csv',
  detection_source: 'signature',
  declared_size: 100,
  received_size: 100,
  sha256: '',
  state: 'ready',
  failure: '',
  created_at: '2026-08-30T00:00:00Z',
  updated_at: '2026-08-31T00:00:00Z',
  completed_at: '2026-08-31T00:00:00Z',
  mime_mismatch: false,
  ...overrides,
});

const ndpProcess: AsyncProcess = {
  kind: 'agent',
  id: 'task_1',
  title: 'ndp #1',
  live_state: 'completed',
  status: 'completed',
  result: {
    workflow_state: {
      acquisition: {
        metadata_source_url: 'https://example.test/data.csv',
        provenance: 'osm_nominatim',
      },
    },
  },
  metadata: {},
};

const parts = (source: { detailParts?: readonly { text: string }[] } | undefined) =>
  source?.detailParts?.map((part) => part.text);

it('keeps the delivered revision authoritative and names a newer live revision separately', () => {
  const [changed] = sessionSources(
    [resourceMessage('m1', 'readings', '1')],
    [],
    [workspaceResource({ id: 'readings', revision: 2 })],
  );
  expect(parts(changed)).toEqual(
    expect.arrayContaining(['text/csv', 'Revision 1', 'Current revision 2']),
  );
  const [same] = sessionSources(
    [resourceMessage('m1', 'readings', '1')],
    [],
    [workspaceResource({ id: 'readings', revision: 1 })],
  );
  expect(parts(same)).toContain('Revision 1');
  expect(parts(same)?.some((text) => text.startsWith('Current revision'))).toBe(false);
});

it('states resource type, size and hash as separate detail parts', () => {
  const [source] = sessionSources(
    [resourceMessage('m1', 'resource_pdf', '1', 'paper.pdf', 'application/pdf')],
    [],
    [
      workspaceResource({
        id: 'resource_pdf',
        name: 'paper.pdf',
        received_size: 4096,
        sha256: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      }),
    ],
  );
  expect(source?.label).toBe('paper.pdf');
  expect(source?.resource?.id).toBe('resource_pdf');
  expect(parts(source)).toEqual([
    'application/pdf',
    'Revision 1',
    formatBytes(4096),
    'SHA-256 abcdef012345…',
  ]);
});

it('collapses one delivered resource revision but keeps distinct resources with identical detail', () => {
  const sources = sessionSources(
    [
      resourceMessage('m1', 'north', '1', 'readings.csv'),
      resourceMessage('m2', 'south', '1', 'readings.csv'),
      resourceMessage('m3', 'north', '1', 'readings.csv'),
    ],
    [],
    [],
  );
  expect(sources.map((source) => source.resource?.id ?? source.id)).toEqual([
    'resource:ws_1:north:1',
    'resource:ws_1:south:1',
  ]);
});

it('keeps citations and workflow-state sources without exposing raw workflow paths', () => {
  const citation: Message = {
    id: 'message_1',
    session_id: 'sess_1',
    role: 'assistant',
    created_at: '2026-08-22T00:00:00Z',
    blocks: [
      {
        id: 'citation_1',
        type: 'citation',
        label: 'EarthScope catalog',
        uri: 'https://example.test/earthscope',
      },
    ],
  };
  const sources = sessionSources([citation], [ndpProcess], []);
  expect(sources).toEqual([
    expect.objectContaining({
      label: 'EarthScope catalog',
      value: 'https://example.test/earthscope',
      link: true,
    }),
    expect.objectContaining({
      label: 'ndp #1, Metadata source URL',
      value: 'https://example.test/data.csv',
      link: true,
    }),
    expect.objectContaining({ label: 'ndp #1, Provenance', value: 'osm_nominatim', link: false }),
  ]);
  expect(sources.some((source) => source.label.includes('workflow_state'))).toBe(false);
});

it('falls back to workflow-state sources when the lineage reports no children', () => {
  const provenance = {
    schema_version: 'clio.execution_provenance.v1',
    provider: 'native',
    session_id: 'sess_1',
    root_session_id: 'sess_1',
    complete: true,
    truncated: false,
    provider_health: {},
    campaigns: [],
    workflows: [],
    agents: [],
    spans: [],
    session_lineage: [],
    nodes: [],
    edges: [],
  } satisfies ExecutionProvenanceResult;
  expect(sessionSources([], [ndpProcess], [], provenance).map((source) => source.label)).toContain(
    'ndp #1, Metadata source URL',
  );
});

it('uses typed child provenance for source ownership instead of scraping workflow state', () => {
  const review: Artifact = {
    id: 'artifact_review',
    session_id: 'session_leaf',
    name: 'review.md',
    media_type: 'text/markdown',
    uri: 'artifact://review.md',
  };
  const input: Artifact = { ...review, id: 'artifact_input', name: 'stations.csv' };
  const node = (
    id: string,
    kind: 'task' | 'resource' | 'artifact',
    label: string,
    attributes: Record<string, unknown>,
  ): ExecutionProvenanceResult['nodes'][number] => ({
    id,
    kind,
    label,
    attributes,
    session_id: 'session_leaf',
    agent_id: 'critic',
    status: 'completed',
    start_time: null,
    end_time: null,
  });
  const provenance: ExecutionProvenanceResult = {
    schema_version: 'clio.execution_provenance.v1',
    provider: 'native',
    session_id: 'session_root',
    root_session_id: 'session_root',
    complete: true,
    truncated: false,
    provider_health: {},
    campaigns: [],
    workflows: [],
    agents: [],
    spans: [],
    session_lineage: [
      {
        session_id: 'session_root',
        parent_session_id: '',
        task_id: '',
        agent_id: '',
        label: 'Investigation',
        depth: 0,
        task_path: [],
      },
      {
        session_id: 'session_leaf',
        parent_session_id: 'session_root',
        task_id: 'task_leaf',
        agent_id: 'critic',
        label: 'Evidence critic',
        depth: 1,
        task_path: ['task_leaf'],
      },
    ],
    nodes: [
      node('task:task_leaf', 'task', 'Evidence critic', { owner_session_id: 'session_leaf' }),
      node('resource:catalog_1', 'resource', 'EarthScope dataset', { resource_id: 'catalog_1' }),
      node('artifact:artifact_review', 'artifact', 'review.md', { artifact_id: 'artifact_review' }),
      node('artifact:artifact_input', 'artifact', 'artifact_input', {
        artifact_id: 'artifact_input',
      }),
    ],
    edges: [
      { id: 'u1', source: 'task:task_leaf', target: 'resource:catalog_1', kind: 'used' },
      { id: 'g1', source: 'task:task_leaf', target: 'artifact:artifact_review', kind: 'generated' },
      { id: 'u2', source: 'task:task_leaf', target: 'artifact:artifact_input', kind: 'used' },
    ],
  };
  const scraped: AsyncProcess = {
    ...ndpProcess,
    id: 'task_leaf',
    title: 'Evidence critic',
    result: { workflow_state: { source_url: 'https://legacy.invalid/scraped' } },
  };
  const sources = sessionSources([], [scraped], [], provenance, [review, input]);
  expect(sources).toEqual([
    expect.objectContaining({
      label: 'EarthScope dataset',
      value: 'catalog_1',
      ownerLabel: 'Evidence critic',
      relation: 'used',
    }),
    expect.objectContaining({ label: 'stations.csv', artifact: input, relation: 'used' }),
  ]);
  expect(sources.some((source) => source.value === 'https://legacy.invalid/scraped')).toBe(false);
});
