import type { AgentBlueprintReference, Session } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioSessionContextBar } from './session-context-bar';

const session: Session = {
  id: 'sess_ndp',
  workspace_id: 'ws_demo',
  title: 'NDP demo',
  state: 'completed',
  created_at: '2026-08-24T00:00:00Z',
  updated_at: '2026-08-24T00:00:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
};

const blueprint: AgentBlueprintReference = {
  id: 'earthscope-flat',
  display_name: 'EarthScope (Flat / Haiku)',
};

afterEach(cleanup);

describe('ClioSessionContextBar', () => {
  it('opens the authoritative session blueprint from its displayed name', async () => {
    const user = userEvent.setup();
    const onOpenBlueprint = vi.fn();
    render(
      <ClioSessionContextBar
        actionsPending={false}
        activeBlueprint={blueprint}
        onCompact={vi.fn()}
        onFork={vi.fn()}
        onOpenBlueprint={onOpenBlueprint}
        onReturnToParent={vi.fn()}
        onShare={vi.fn()}
        onUndo={vi.fn()}
        session={session}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'EarthScope (Flat / Haiku)' }));

    expect(onOpenBlueprint).toHaveBeenCalledWith(blueprint);
    expect(screen.queryByText('Default agent')).not.toBeInTheDocument();
  });
});
