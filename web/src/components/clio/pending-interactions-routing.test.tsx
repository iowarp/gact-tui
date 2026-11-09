import type { Artifact, PendingInteraction } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadMarkdownText } from '@/components/ai-elements/markdown-text-loader';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ClioPendingInteractions } from './pending-interactions';

beforeAll(async () => {
  await loadMarkdownText();
}, 60_000);

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
      screen.queryByRole('region', { name: 'Agent needs your attention' }),
    ).not.toBeInTheDocument();
  });

  it('opens the saved plan of a plan review from the dock', () => {
    const plan = { id: 'plan_v2', name: 'regrid.md' } as unknown as Artifact;
    const onOpenArtifact = vi.fn();
    const interaction: PendingInteraction = {
      id: 'question:plan',
      kind: 'question',
      owner_session_id: 'sess_root',
      attended_session_id: 'sess_root',
      status: 'pending',
      title: 'Review execution plan',
      source: { protocol: 'native', tool_name: 'plan_exit' },
      created_at: '2026-09-02T00:00:00Z',
      actions: ['answer'],
      payload: {
        plan_exit: {
          plan_file: 'plans/regrid.md',
          plan_content: '# Regrid',
          plan_content_status: 'complete',
          artifact_ref: { artifact_id: 'plan_v2' },
        },
      },
    };

    render(
      <TooltipProvider>
        <ClioPendingInteractions
          artifacts={{ plan_v2: plan }}
          interactions={[interaction]}
          onOpenArtifact={onOpenArtifact}
          onResponse={vi.fn(async () => undefined)}
          viewedSessionId="sess_root"
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Open plan/u }));
    expect(onOpenArtifact).toHaveBeenCalledWith(plan);
  });
});
