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
});
