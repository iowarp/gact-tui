import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioPendingInteractions } from './pending-interactions';

afterEach(cleanup);

describe('pending interaction routing', () => {
  it('does not turn an agent-addressed question into human attention', () => {
    const interaction: PendingInteraction = {
      id: 'question:agent-routed',
      kind: 'question',
      owner_session_id: 'sess_child',
      attended_session_id: 'sess_root',
      status: 'pending',
      title: 'Specialist question',
      requires_human_response: false,
      audience: 'agent',
      routing_state: 'elicitation_routed_to_agent',
      source: { protocol: 'mcp' },
      created_at: '2026-09-02T00:00:00Z',
      actions: [],
    };

    render(
      <ClioPendingInteractions
        interactions={[interaction]}
        onResponse={vi.fn(async () => undefined)}
        viewedSessionId="sess_root"
      />,
    );

    expect(
      screen.queryByRole('region', { name: 'Agent needs your response' }),
    ).not.toBeInTheDocument();
  });
});
