import type { Session } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioSessionContextBar } from './session-context-bar';
const downloads = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/tauri/downloads', () => ({ openDownloads: downloads.open }));
vi.mock('./session-agent-control', () => ({
  SessionAgentControl: ({
    fallbackLabel,
    onOpenAgent,
  }: {
    fallbackLabel?: string;
    onOpenAgent: () => void;
  }) => (
    <button onClick={onOpenAgent} type="button">
      {fallbackLabel}
    </button>
  ),
}));

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

afterEach(cleanup);

describe('ClioSessionContextBar', () => {
  it.each(['agent', 'lookup'] as const)('hides branching for a %s session', async (kind) => {
    const user = userEvent.setup();
    const onFork = vi.fn();
    render(
      <ClioSessionContextBar
        actionsPending={false}
        onCompact={vi.fn()}
        onFork={onFork}
        onOpenAgent={vi.fn()}
        onReturnToParent={vi.fn()}
        onShare={vi.fn()}
        onUndo={vi.fn()}
        session={{ ...session, session_kind: kind, parent_session_id: 'parent' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: `Actions for ${session.title}` }));
    expect(screen.queryByRole('menuitem', { name: 'Branch into a new session' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Share read-only link' })).toBeVisible();
    expect(onFork).not.toHaveBeenCalled();
  });

  it('opens the conversation agent from its displayed name', async () => {
    const user = userEvent.setup();
    const onOpenAgent = vi.fn();
    render(
      <ClioSessionContextBar
        actionsPending={false}
        agentLabel="EarthScope (Flat / Haiku)"
        onCompact={vi.fn()}
        onFork={vi.fn()}
        onOpenAgent={onOpenAgent}
        onReturnToParent={vi.fn()}
        onShare={vi.fn()}
        onUndo={vi.fn()}
        session={session}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'EarthScope (Flat / Haiku)' }));

    expect(onOpenAgent).toHaveBeenCalledOnce();
  });

  it('shows no agent control while the session is unavailable', () => {
    render(
      <ClioSessionContextBar
        actionsPending={false}
        agentLabel="CLIO"
        onCompact={vi.fn()}
        onFork={vi.fn()}
        onOpenAgent={vi.fn()}
        onReturnToParent={vi.fn()}
        onShare={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Session unavailable' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'CLIO' })).toBeNull();
  });

  it('opens native Downloads from the desktop toolbar', async () => {
    const user = userEvent.setup();
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    try {
      render(
        <ClioSessionContextBar
          actionsPending={false}
          onCompact={vi.fn()}
          onFork={vi.fn()}
          onOpenAgent={vi.fn()}
          onReturnToParent={vi.fn()}
          onShare={vi.fn()}
          onUndo={vi.fn()}
          session={session}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Open downloads' }));
      expect(downloads.open).toHaveBeenCalledOnce();
    } finally {
      Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    }
  });

  it('hides native Downloads in a browser', () => {
    render(
      <ClioSessionContextBar
        actionsPending={false}
        onCompact={vi.fn()}
        onFork={vi.fn()}
        onOpenAgent={vi.fn()}
        onReturnToParent={vi.fn()}
        onShare={vi.fn()}
        onUndo={vi.fn()}
        session={session}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Open downloads' })).toBeNull();
  });

  it('hides its own session-title heading inside Tauri, where the desktop title bar already shows it', () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    try {
      render(
        <ClioSessionContextBar
          actionsPending={false}
          agentLabel="EarthScope (Flat / Haiku)"
          onCompact={vi.fn()}
          onFork={vi.fn()}
          onOpenAgent={vi.fn()}
          onReturnToParent={vi.fn()}
          onShare={vi.fn()}
          onUndo={vi.fn()}
          session={session}
        />,
      );

      expect(screen.queryByRole('heading', { name: session.title })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'EarthScope (Flat / Haiku)' }),
      ).not.toBeInTheDocument();
      // The actions beside it are not chrome, so they still render.
      expect(
        screen.getByRole('button', { name: `Actions for ${session.title}` }),
      ).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    }
  });
});
