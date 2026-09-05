import type { ExecutionProvenanceResult } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  describeArtifactResearch,
  projectArtifactResearchProvenance,
} from './artifact-research-provenance';

describe('artifact research provenance', () => {
  it('keeps the observable tool/delegation slice that preceded the selected artifact', () => {
    const provenance = fixture();

    const projected = projectArtifactResearchProvenance(provenance, 'artifact_report');

    expect(projected.nodes.map((node) => node.id)).toEqual([
      'session:sess_root',
      'task:task_researcher',
      'session:sess_researcher',
      'tool:fetch-before',
      'artifact:artifact_report',
    ]);
    expect(projected.edges.map((edge) => edge.id)).toEqual([
      'delegated',
      'executes',
      'contains-before',
      'generated',
    ]);
    expect(projected.session_lineage?.map((row) => row.session_id)).toEqual(['sess_researcher']);
    expect(describeArtifactResearch(projected)).toBe(
      '1 tool calls across 1 runs before this result was created, including 0 searches and 1 fetches. Workflow activity is observable history; declared evidence relationships remain separate.',
    );
  });
});

function fixture(): ExecutionProvenanceResult {
  const baseNode = {
    status: 'completed',
    agent_id: '',
    start_time: null,
    end_time: null,
    attributes: {},
  };
  return {
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
        session_id: 'sess_researcher',
        parent_session_id: 'sess_root',
        task_id: 'task_researcher',
        agent_id: 'researcher',
        label: 'researcher #1',
        depth: 1,
        task_path: ['task_researcher'],
      },
      {
        session_id: 'sess_later',
        parent_session_id: 'sess_root',
        task_id: 'task_later',
        agent_id: 'critic',
        label: 'critic #1',
        depth: 1,
        task_path: ['task_later'],
      },
    ],
    spans: [
      {
        id: 'artifact-created',
        parent_id: '',
        kind: 'artifact',
        session_id: 'sess_root',
        workflow_id: '',
        campaign_id: '',
        agent_id: '',
        source_agent_id: '',
        label: 'Artifact report created',
        event_type: 'artifact.created',
        status: 'completed',
        start_time: 50,
        end_time: 50,
        duration_ms: 0,
        host: '',
        artifact_refs: [{ artifact_id: 'artifact_report', sha256: 'a'.repeat(64) }],
        attributes: {},
        source_event_ids: ['artifact-created'],
      },
    ],
    nodes: [
      {
        ...baseNode,
        id: 'session:sess_root',
        kind: 'session',
        label: 'Deep research',
        session_id: 'sess_root',
      },
      {
        ...baseNode,
        id: 'task:task_researcher',
        kind: 'task',
        label: 'Researcher #1',
        session_id: 'sess_researcher',
      },
      {
        ...baseNode,
        id: 'session:sess_researcher',
        kind: 'session',
        label: 'researcher #1',
        session_id: 'sess_researcher',
      },
      {
        ...baseNode,
        id: 'tool:fetch-before',
        kind: 'tool',
        label: 'researcher model action 1: web_fetch',
        session_id: 'sess_researcher',
        start_time: 40,
        attributes: {
          tool_name: 'web_fetch',
          tool_input: { target: 'https://example.test/paper.pdf' },
        },
      },
      {
        ...baseNode,
        id: 'tool:search-after',
        kind: 'tool',
        label: 'critic model action 1: web_search',
        session_id: 'sess_later',
        start_time: 60,
        attributes: { tool_name: 'web_search', tool_input: { query: 'later work' } },
      },
      {
        ...baseNode,
        id: 'artifact:artifact_report',
        kind: 'artifact',
        label: 'report.md',
        session_id: 'sess_root',
      },
      {
        ...baseNode,
        id: 'artifact:artifact_other',
        kind: 'artifact',
        label: 'other.md',
        session_id: 'sess_root',
      },
    ],
    edges: [
      {
        id: 'delegated',
        source: 'session:sess_root',
        target: 'task:task_researcher',
        kind: 'delegated',
      },
      {
        id: 'executes',
        source: 'task:task_researcher',
        target: 'session:sess_researcher',
        kind: 'executes_in',
      },
      {
        id: 'contains-before',
        source: 'task:task_researcher',
        target: 'tool:fetch-before',
        kind: 'contains',
      },
      {
        id: 'contains-after',
        source: 'task:task_later',
        target: 'tool:search-after',
        kind: 'contains',
      },
      {
        id: 'generated',
        source: 'session:sess_root',
        target: 'artifact:artifact_report',
        kind: 'generated',
      },
    ],
  };
}
