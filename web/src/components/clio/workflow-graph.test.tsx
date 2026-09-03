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

  it('connects nested children through their authoritative task path', () => {
    const graph = buildWorkflowGraph(
      [
        {
          kind: 'agent',
          id: 'task_parent',
          title: 'Evidence researcher',
          live_state: 'running',
          status: 'running',
          owner_session_id: 'session_child',
          parent_session_id: 'session_root',
          child_session_id: 'session_child',
          task_path: ['task_parent'],
          metadata: {},
        },
        {
          kind: 'agent',
          id: 'task_leaf',
          title: 'Evidence critic',
          live_state: 'completed',
          status: 'completed',
          owner_session_id: 'session_leaf',
          parent_session_id: 'session_child',
          child_session_id: 'session_leaf',
          task_path: ['task_parent', 'task_leaf'],
          metadata: {},
        },
      ],
      [],
      'TB',
    );

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'session-root', target: 'task_parent' }),
        expect.objectContaining({ source: 'task_parent', target: 'task_leaf' }),
      ]),
    );
    expect(graph.nodes.find((node) => node.id === 'task_leaf')?.ariaLabel).toContain('Depth 2');
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
        edges: [{ id: 'edge_1', source: 'tool_1', target: 'artifact_missing', kind: 'generated' }],
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

  it('preserves child owner and task navigation identity on projected nodes', () => {
    const graph = buildExecutionProvenanceGraph(
      {
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
        session_lineage: [
          {
            session_id: 'session_leaf',
            parent_session_id: 'session_root',
            task_id: 'task_leaf',
            agent_id: 'critic',
            label: 'Evidence critic',
            depth: 2,
            task_path: ['task_parent', 'task_leaf'],
          },
        ],
        spans: [],
        nodes: [
          {
            id: 'artifact:review',
            kind: 'artifact',
            label: 'Review artifact',
            status: 'available',
            session_id: 'session_leaf',
            agent_id: 'critic',
            start_time: null,
            end_time: null,
            attributes: {
              owner_session_id: 'session_leaf',
              task_id: 'task_leaf',
              depth: 2,
            },
          },
        ],
        edges: [],
      },
      'LR',
    );

    expect(graph.nodes[0]?.data).toMatchObject({
      ownerSessionId: 'session_leaf',
      taskId: 'task_leaf',
      depth: 2,
      detail: 'artifact, Evidence critic, 2 levels deep',
    });
  });

  it('renders CLIO typed causal relationships without renaming them in the browser', () => {
    const node = (id: string, kind: string) => ({
      id,
      kind,
      label: id,
      status: 'completed',
      session_id: 'session_root',
      agent_id: '',
      start_time: null,
      end_time: null,
      attributes: {},
    });
    const graph = buildExecutionProvenanceGraph(
      {
        schema_version: 'clio.execution_provenance.v1',
        provider: 'native',
        session_id: 'session_root',
        complete: true,
        truncated: false,
        provider_health: {},
        campaigns: [],
        workflows: [],
        agents: [],
        spans: [],
        nodes: [
          node('session:root', 'session'),
          node('task:child', 'task'),
          node('resource:input', 'resource'),
          node('artifact:output', 'artifact'),
          node('interaction:question', 'interaction'),
        ],
        edges: [
          {
            id: 'delegated',
            source: 'session:root',
            target: 'task:child',
            kind: 'delegated',
          },
          { id: 'used', source: 'task:child', target: 'resource:input', kind: 'used' },
          {
            id: 'generated',
            source: 'task:child',
            target: 'artifact:output',
            kind: 'generated',
          },
          {
            id: 'responded',
            source: 'task:child',
            target: 'interaction:question',
            kind: 'responded_to',
          },
        ],
      },
      'LR',
    );

    expect(graph.edges.map((edge) => edge.label)).toEqual([
      'delegated',
      'used',
      'generated',
      'responded_to',
    ]);
  });
});
