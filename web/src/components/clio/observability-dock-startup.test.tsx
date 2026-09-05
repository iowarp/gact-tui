import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

import { ClioObservabilityDock } from './observability-dock';

afterEach(cleanup);

describe('ClioObservabilityDock startup status', () => {
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
            blocks: [{ id: 'block_assistant_old', type: 'text', text: 'Old answer' }],
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
        .getAllByText('Setting up session')
        .find((element) => !element.classList.contains('sr-only')),
    ).toBeVisible();
    expect(screen.queryByText('Agent is responding')).not.toBeInTheDocument();
  });
});
