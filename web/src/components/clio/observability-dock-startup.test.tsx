import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

import { ClioObservabilityDock } from './observability-dock';

afterEach(cleanup);

describe('ClioObservabilityDock startup status', () => {
  it('recognizes v3 run ids and tool activity before the assistant run id arrives', () => {
    render(<ClioObservabilityDock activeTurnId="run_current" artifacts={[]} contextFiles={[]}
      contextFrames={[]} diffs={[]} infrastructureDependencies={[]}
      messages={[
        { id: 'msg_old', session_id: 'sess_1', run_id: 'run_old', role: 'assistant',
          created_at: '2026-09-05T19:59:59Z',
          blocks: [{ id: 'old_text', type: 'text', text: 'Previous answer' }] },
        { id: 'msg_user', session_id: 'sess_1', run_id: 'run_current', role: 'user',
          created_at: '2026-09-05T20:00:00Z',
          blocks: [{ id: 'user_text', type: 'text', text: 'Next question' }] },
        { id: 'msg_tool', session_id: 'sess_1', role: 'assistant',
          created_at: '2026-09-05T20:00:01Z',
          blocks: [{ id: 'tool_block', type: 'tool', tool_id: 'load_skill_1' }] },
      ]}
      processes={[]} runs={[]} sessionState="running" subagents={[]} tasks={[]} tools={[]} />);
    expect(screen.getByText('Working on your request')).toBeVisible();
    expect(screen.queryByText('Preparing next response')).not.toBeInTheDocument();
    expect(screen.queryByText('Starting')).not.toBeInTheDocument();
  });

  it('keeps initial session setup when the agent has not started', () => {
    render(<ClioObservabilityDock activeTurnId="turn_first" artifacts={[]} contextFiles={[]}
      contextFrames={[]} diffs={[]} infrastructureDependencies={[]} messages={[]}
      processes={[]} runs={[]} sessionState="running" subagents={[]} tasks={[]} tools={[]} />);
    expect(screen.getAllByText('Setting up session').find(
      (element) => !element.classList.contains('sr-only'),
    )).toBeVisible();
  });

  it('keeps working after current-turn tool activity even between tool invocations', () => {
    render(<ClioObservabilityDock activeTurnId="turn_current" artifacts={[]} contextFiles={[]}
      contextFrames={[]} diffs={[]} infrastructureDependencies={[]}
      messages={[{ id: 'msg_tool', session_id: 'sess_1', turn_id: 'turn_current',
        role: 'assistant', created_at: '2026-09-05T20:00:01Z',
        blocks: [{ id: 'tool_block', type: 'tool', tool_id: 'load_skill_1' }] }]}
      processes={[]} runs={[]} sessionState="running" subagents={[]} tasks={[]} tools={[]} />);
    expect(screen.getByText('Working on your request')).toBeVisible();
    expect(screen.queryByText('Setting up session')).not.toBeInTheDocument();
    expect(screen.queryByText('Starting')).not.toBeInTheDocument();
  });

  it('replaces the generic startup label with the active MCP preparation phase', () => {
    render(
      <ClioObservabilityDock
        activeTurnId="turn_1"
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        infrastructureDependencies={[
          {
            id: 'sess_1:mcp:geo',
            session_id: 'sess_1',
            category: 'mcp',
            namespace: 'geo',
            title: 'Geo MCP',
            phase: 'launch',
            state: 'running',
            attempt: 1,
            max_attempts: 3,
            observed_active: true,
          },
        ]}
        messages={[]}
        processes={[]}
        runs={[]}
        sessionState="running"
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    expect(
      screen
        .getAllByText('Setting up environment (loading MCP Geo)')
        .find((element) => !element.classList.contains('sr-only')),
    ).toBeVisible();
    expect(screen.queryByText('Starting agent')).not.toBeInTheDocument();
  });

  it('keeps responding status after the current assistant stream closes', () => {
    const { rerender } = render(
      <ClioObservabilityDock
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        infrastructureDependencies={[]}
        messages={[
          {
            id: 'msg_user',
            session_id: 'sess_1',
            turn_id: 'turn_1',
            role: 'user',
            created_at: '2026-09-05T20:00:00Z',
            blocks: [{ id: 'block_user', type: 'text', text: 'Hello' }],
          },
          {
            id: 'msg_assistant',
            session_id: 'sess_1',
            turn_id: 'turn_1',
            role: 'assistant',
            created_at: '2026-09-05T20:00:01Z',
            blocks: [
              {
                id: 'block_assistant',
                type: 'text',
                text: 'Finishing up',
                streaming: true,
              },
            ],
          },
        ]}
        processes={[]}
        runs={[]}
        sessionState="running"
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    expect(screen.getByText('Agent is responding')).toBeVisible();

    rerender(
      <ClioObservabilityDock
        activeTurnId="turn_1"
        activeTurnResponded
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        infrastructureDependencies={[]}
        messages={[
          {
            id: 'msg_user',
            session_id: 'sess_1',
            turn_id: 'turn_1',
            role: 'user',
            created_at: '2026-09-05T20:00:00Z',
            blocks: [{ id: 'block_user', type: 'text', text: 'Hello' }],
          },
          {
            id: 'msg_assistant',
            session_id: 'sess_1',
            turn_id: 'turn_1',
            role: 'assistant',
            created_at: '2026-09-05T20:00:01Z',
            blocks: [{ id: 'block_assistant', type: 'text', text: 'Finishing up' }],
          },
        ]}
        processes={[]}
        runs={[]}
        sessionState="running"
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    expect(screen.getByText('Agent is responding')).toBeVisible();
    expect(screen.queryByText('Starting agent')).not.toBeInTheDocument();
  });

  it('does not treat an assistant response before the latest user turn as current', () => {
    render(
      <ClioObservabilityDock
        activeTurnId="turn_new"
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        infrastructureDependencies={[]}
        messages={[
          {
            id: 'msg_assistant_old',
            session_id: 'sess_1',
            turn_id: 'turn_old',
            role: 'assistant',
            created_at: '2026-09-05T19:59:59Z',
            blocks: [{ id: 'block_assistant_old', type: 'text', text: 'Old answer', streaming: true }],
          },
          {
            id: 'msg_user',
            session_id: 'sess_1',
            turn_id: 'turn_new',
            role: 'user',
            created_at: '2026-09-05T20:00:00Z',
            blocks: [{ id: 'block_user', type: 'text', text: 'New turn' }],
          },
        ]}
        processes={[]}
        runs={[]}
        sessionState="running"
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    expect(
      screen
        .getAllByText('Preparing next response')
        .find((element) => !element.classList.contains('sr-only')),
    ).toBeVisible();
    expect(screen.queryByText('Agent is responding')).not.toBeInTheDocument();
  });
});
