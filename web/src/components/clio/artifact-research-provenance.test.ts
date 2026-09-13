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
      '1 tool call across 1 run in the causal turn, including 0 searches and 1 fetch. Workflow activity is observable history; declared evidence relationships remain separate.',
    );
  });

  it('excludes earlier work in the same long-lived session from the artifact causal turn', () => {
    const provenance = fixture();
    provenance.session_lineage?.unshift({
      session_id: 'sess_earlier',
      parent_session_id: 'sess_root',
      task_id: 'task_earlier',
      agent_id: 'researcher',
      label: 'earlier researcher',
      depth: 1,
      task_path: ['task_earlier'],
      created_at: '1970-01-01T00:00:10.000Z',
    });
    provenance.nodes.splice(1, 0, {
      id: 'tool:root-current',
      kind: 'tool',
      label: 'main model action: create_artifact',
      status: 'completed',
      session_id: 'sess_root',
      agent_id: 'main',
      start_time: 49,
      end_time: 49,
      attributes: { tool_name: 'create_artifact', turn_id: 'turn_report' },
    });
    provenance.nodes.splice(1, 0, {
      id: 'tool:root-earlier',
      kind: 'tool',
      label: 'main model action: web_search',
      status: 'completed',
      session_id: 'sess_root',
      agent_id: 'main',
      start_time: 20,
      end_time: 20,
      attributes: { tool_name: 'web_search', turn_id: 'turn_earlier' },
    });
    provenance.nodes.splice(1, 0, {
      id: 'tool:earlier-child',
      kind: 'tool',
      label: 'earlier researcher model action: web_fetch',
      status: 'completed',
      session_id: 'sess_earlier',
      agent_id: 'researcher',
      start_time: 25,
      end_time: 25,
      attributes: { tool_name: 'web_fetch' },
    });
    provenance.nodes[0] = {
      ...provenance.nodes[0],
      start_time: 30,
      attributes: { turn_id: 'turn_report' },
    };
    provenance.session_lineage![1] = {
      ...provenance.session_lineage![1],
      created_at: '1970-01-01T00:00:35.000Z',
    };
    provenance.spans[0] = {
      ...provenance.spans[0],
      attributes: { turn_id: 'turn_report' },
    };

    const projected = projectArtifactResearchProvenance(provenance, 'artifact_report');

    expect(projected.nodes.map((node) => node.id)).toEqual([
      'session:sess_root',
      'tool:root-current',
      'task:task_researcher',
      'session:sess_researcher',
      'tool:fetch-before',
      'artifact:artifact_report',
    ]);
    expect(projected.session_lineage?.map((row) => row.session_id)).toEqual(['sess_researcher']);
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
        created_at: '1970-01-01T00:00:35.000Z',
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
        attributes: { turn_id: 'turn_report' },
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
