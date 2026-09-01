import { describe, expect, it } from 'vitest';
import { buildExecutionProvenanceGraph, buildWorkflowGraph } from './workflow-graph';

describe('buildWorkflowGraph', () => {
  it('builds an accessible session-to-child topology from authoritative processes', () => {
    const graph = buildWorkflowGraph(
      [
        {
          kind: 'agent',
          id: 'task_ndp',
          title: 'ndp #1',
          live_state: 'completed',
          status: 'completed',
          parent_session_id: 'session_parent',
          child_session_id: 'session_child',
          depth: 1,
          created_at: '2026-08-22T00:00:00Z',
          updated_at: '2026-08-22T00:01:00Z',
          metadata: {},
        },
      ],
      [
        {
          id: 'task_ndp',
          session_id: 'session_parent',
          child_session_id: 'session_child',
          title: 'ndp #1',
          state: 'completed',
        },
      ],
      'TB',
    );

    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0]).toMatchObject({
      id: 'session-root',
      ariaLabel: 'Current session, 1 delegated run, completed',
    });
    expect(graph.nodes[1]?.data.subagent?.child_session_id).toBe('session_child');
    expect(graph.nodes[1]?.ariaLabel).toContain('Depth 1, 1m');
    expect(graph.edges).toEqual([
      expect.objectContaining({ source: 'session-root', target: 'task_ndp' }),
    ]);
  });
});

describe('buildExecutionProvenanceGraph', () => {
  it('preserves every provider relationship and exposes missing referenced nodes', () => {
    const graph = buildExecutionProvenanceGraph(
      {
        schema_version: 'clio.execution_provenance.v1',
        provider: 'flowcept',
        session_id: 'sess_1',
        complete: false,
        truncated: false,
        provider_health: {},
        campaigns: [],
        workflows: [],
        agents: [],
        spans: [],
        nodes: [
          {
            id: 'tool_1',
            kind: 'tool',
            label: 'Stage resource',
            status: 'completed',
            session_id: 'sess_1',
            agent_id: 'main',
            start_time: 1,
            end_time: 2,
            attributes: {},
          },
        ],
        edges: [
          { id: 'edge_1', source: 'tool_1', target: 'artifact_missing', kind: 'generated' },
        ],
      },
      'LR',
    );

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      source: 'tool_1',
      target: 'artifact_missing',
      label: 'generated',
    });
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'tool_1' }),
        expect.objectContaining({
          id: 'artifact_missing',
          data: expect.objectContaining({ missing: true }),
        }),
      ]),
    );
  });
});
