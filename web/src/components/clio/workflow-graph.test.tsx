import { describe, expect, it } from 'vitest';
import { buildWorkflowGraph } from './workflow-graph';

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
