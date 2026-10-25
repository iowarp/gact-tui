import type { Artifact, ExecutionProvenanceResult } from '@clio/core/v3';
import { expect, it } from 'vitest';
import { artifactOwnerLabels, sessionSources } from './observability-evidence-sources';

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
  expect(artifactOwnerLabels(provenance).get('report')).toBe('First actor');
});
