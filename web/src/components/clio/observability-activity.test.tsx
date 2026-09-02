import type { AsyncProcess, ExecutionProvenanceResult, Message } from '@clio/core/v3';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { childProjectionActivityItems, ClioActivityTimeline } from './observability-activity';

const processes: AsyncProcess[] = [
  {
    kind: 'agent',
    id: 'task_child',
    title: 'Evidence researcher',
    live_state: 'running',
    status: 'running',
    root_session_id: 'session_root',
    owner_session_id: 'session_child',
    parent_session_id: 'session_root',
    child_session_id: 'session_child',
    parent_turn_id: 'turn_root',
    task_path: ['task_child'],
    depth: 1,
    created_at: '2026-09-02T12:00:00Z',
    updated_at: '2026-09-02T12:01:00Z',
    metadata: {},
  },
  {
    kind: 'agent',
    id: 'task_leaf',
    title: 'Evidence leaf',
    live_state: 'completed',
    status: 'completed',
    root_session_id: 'session_root',
    owner_session_id: 'session_leaf',
    parent_session_id: 'session_child',
    child_session_id: 'session_leaf',
    task_path: ['task_child', 'task_leaf'],
    depth: 2,
    created_at: '2026-09-02T12:00:10Z',
    updated_at: '2026-09-02T12:00:50Z',
    metadata: {},
  },
  {
    kind: 'mcp-task',
    id: 'mcp_review_task',
    title: 'Review station quality',
    live_state: 'completed',
    status: 'completed',
    root_session_id: 'session_root',
    owner_session_id: 'session_leaf',
    task_path: ['task_child', 'task_leaf'],
    created_at: '2026-09-02T12:00:20Z',
    updated_at: '2026-09-02T12:00:40Z',
    metadata: {},
  },
];

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
      session_id: 'session_child',
      parent_session_id: 'session_root',
      task_id: 'task_child',
      agent_id: 'researcher',
      label: 'Evidence researcher',
      depth: 1,
      task_path: ['task_child'],
    },
    {
      session_id: 'session_leaf',
      parent_session_id: 'session_child',
      task_id: 'task_leaf',
      agent_id: 'critic',
      label: 'Evidence leaf',
      depth: 2,
      task_path: ['task_child', 'task_leaf'],
    },
  ],
  spans: [
    {
      id: 'tool_leaf',
      parent_id: '',
      kind: 'tool',
      session_id: 'session_leaf',
      root_session_id: 'session_root',
      owner_session_id: 'session_leaf',
      workflow_id: '',
      campaign_id: '',
      agent_id: 'critic',
      source_agent_id: '',
      task_id: 'task_leaf',
      task_path: ['task_child', 'task_leaf'],
      invocation_id: 'invoke_leaf',
      tool_name: 'web_search',
      label: 'Checked primary evidence',
      event_type: 'tool.call.completed',
      status: 'completed',
      start_time: 1_788_350_420,
      end_time: 1_788_350_430,
      duration_ms: 10_000,
      host: 'local',
      artifact_refs: [],
      attributes: {},
      source_event_ids: ['event_tool_leaf'],
    },
    {
      id: 'hidden_reasoning',
      parent_id: '',
      kind: 'llm',
      session_id: 'session_leaf',
      root_session_id: 'session_root',
      owner_session_id: 'session_leaf',
      workflow_id: '',
      campaign_id: '',
      agent_id: 'critic',
      source_agent_id: '',
      task_id: 'task_leaf',
      task_path: ['task_child', 'task_leaf'],
      label: 'Private reasoning must remain hidden',
      event_type: 'lm.completed',
      status: 'completed',
      start_time: 1_788_350_410,
      end_time: 1_788_350_415,
      duration_ms: 5_000,
      host: 'local',
      artifact_refs: [],
      attributes: {},
      source_event_ids: ['event_hidden'],
    },
    {
      id: 'surface_ready',
      parent_id: '',
      kind: 'interactive_work',
      session_id: 'session_leaf',
      root_session_id: 'session_root',
      owner_session_id: 'session_leaf',
      workflow_id: '',
      campaign_id: '',
      agent_id: 'critic',
      source_agent_id: '',
      task_id: 'task_leaf',
      task_path: ['task_child', 'task_leaf'],
      surface_id: 'surface_station_review',
      label: 'Station review ready',
      event_type: 'a2ui.surface.ready',
      status: 'completed',
      start_time: 1_788_350_440,
      end_time: 1_788_350_440,
      duration_ms: 0,
      host: 'local',
      artifact_refs: [],
      attributes: {},
      source_event_ids: ['event_surface'],
    },
  ],
  nodes: [],
  edges: [],
};

describe('child work activity projection', () => {
  it('preserves authoritative task identity, depth, lifecycle, and safe high-signal activity', () => {
    const items = childProjectionActivityItems(provenance, processes);

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'task_leaf:branch-open',
          groupId: undefined,
          ownerSessionId: 'session_leaf',
          parentSessionId: 'session_child',
          taskPath: ['task_child', 'task_leaf'],
          depth: 2,
          lifecycle: 'open',
          state: 'completed',
        }),
        expect.objectContaining({
          id: 'task_leaf:branch-close',
          state: 'completed',
          depth: 2,
          lifecycle: 'close',
        }),
        expect.objectContaining({
          id: 'projected:tool_leaf',
          ownerSessionId: 'session_leaf',
          taskId: 'task_leaf',
          depth: 2,
          kind: 'tool',
        }),
        expect.objectContaining({
          id: 'mcp-task:mcp_review_task',
          kind: 'process',
          label: 'Review station quality',
          detail: 'MCP task',
          ownerSessionId: 'session_leaf',
          depth: 2,
        }),
        expect.objectContaining({
          id: 'projected:surface_ready',
          kind: 'interaction',
          label: 'Station review ready',
          ownerSessionId: 'session_leaf',
          taskId: 'task_leaf',
          depth: 2,
        }),
      ]),
    );
    expect(items.some((item) => item.label.includes('Private reasoning'))).toBe(false);
    expect(items.find((item) => item.id === 'task_child:branch-open')?.groupId).toBe('turn_root');
  });

  it('renders a navigable nested branch at its delegation point', () => {
    const onOpen = vi.fn();
    const branch = childProjectionActivityItems(provenance, processes).find(
      (item) => item.id === 'task_child:branch-open',
    );
    expect(branch).toBeDefined();
    const messages: Message[] = [
      {
        id: 'turn_root',
        session_id: 'session_root',
        role: 'user',
        created_at: '2026-09-02T12:00:00Z',
        blocks: [{ id: 'text_root', type: 'text', text: 'Review the evidence.' }],
      },
    ];
    render(<ClioActivityTimeline items={[{ ...branch!, onOpen }]} messages={messages} />);

    const row = screen.getByRole('button', { name: 'Evidence researcher, running, depth 1' });
    expect(row.closest('[data-slot="timeline-item"]')).toHaveStyle({ marginInlineStart: '0px' });
    expect(row).toHaveStyle({ marginInlineStart: '14px' });
    fireEvent.click(row);
    expect(onOpen).toHaveBeenLastCalledWith('conversation');
    fireEvent.click(screen.getByRole('button', { name: 'Open Evidence researcher in canvas' }));
    expect(onOpen).toHaveBeenLastCalledWith('canvas');
  });

  it('keeps a deeper child branch visibly nested when it has no containing root turn', () => {
    const branch = childProjectionActivityItems(provenance, processes).find(
      (item) => item.id === 'task_leaf:branch-open',
    );
    expect(branch).toBeDefined();

    render(<ClioActivityTimeline items={[branch!]} messages={[]} />);

    const row = screen.getAllByText('Evidence leaf')[0];
    expect(row.closest('[data-slot="timeline-item"]')).toHaveStyle({ marginInlineStart: '28px' });
  });
});
