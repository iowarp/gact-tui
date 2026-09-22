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

  it('identifies an unconfigured root conversation as the base agent', () => {
    render(
      <ClioSessionContextBar
        actionsPending={false}
        onCompact={vi.fn()}
        onFork={vi.fn()}
        onOpenBlueprint={vi.fn()}
        onReturnToParent={vi.fn()}
        onShare={vi.fn()}
        onUndo={vi.fn()}
        session={session}
      />,
    );

    expect(screen.getByText('Base agent')).toBeVisible();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('does not mislabel a child agent as the base agent', () => {
    render(
      <ClioSessionContextBar
        actionsPending={false}
        onCompact={vi.fn()}
        onFork={vi.fn()}
        onOpenBlueprint={vi.fn()}
        onReturnToParent={vi.fn()}
        onShare={vi.fn()}
        onUndo={vi.fn()}
        session={{ ...session, agent_id: 'researcher', parent_session_id: 'sess_parent' }}
      />,
    );

    expect(screen.queryByText('Base agent')).not.toBeInTheDocument();
  });

  it('opens a native terminal for the active workspace when available', async () => {
    const user = userEvent.setup();
    const onOpenTerminal = vi.fn().mockResolvedValue(undefined);
    render(
      <ClioSessionContextBar
        actionsPending={false}
        onCompact={vi.fn()}
        onFork={vi.fn()}
        onOpenBlueprint={vi.fn()}
        onOpenTerminal={onOpenTerminal}
        onReturnToParent={vi.fn()}
        onShare={vi.fn()}
        onUndo={vi.fn()}
        session={session}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open terminal in workspace' }));

    expect(onOpenTerminal).toHaveBeenCalledOnce();
  });

  it('hides the native terminal action when it is unavailable', () => {
    render(
      <ClioSessionContextBar
        actionsPending={false}
        onCompact={vi.fn()}
        onFork={vi.fn()}
        onOpenBlueprint={vi.fn()}
        onReturnToParent={vi.fn()}
        onShare={vi.fn()}
        onUndo={vi.fn()}
        session={session}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Open terminal in workspace' })).toBeNull();
  });

  it('hides its own session-title heading inside Tauri, where the desktop title bar already shows it', () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    try {
      render(
        <ClioSessionContextBar
          actionsPending={false}
          activeBlueprint={blueprint}
          onCompact={vi.fn()}
          onFork={vi.fn()}
          onOpenBlueprint={vi.fn()}
          onReturnToParent={vi.fn()}
          onShare={vi.fn()}
          onUndo={vi.fn()}
          session={session}
        />,
      );

      expect(screen.queryByRole('heading', { name: session.title })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'EarthScope (Flat / Haiku)' })).not.toBeInTheDocument();
      // The actions beside it are not chrome, so they still render.
      expect(screen.getByRole('button', { name: `Actions for ${session.title}` })).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    }
  });
});
