import { clearDesktopHost, mockDesktopHost } from '@/test/desktop-host';
import type { Session } from '@clio/core/v3';
import { cleanup, render as renderElement, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioSessionContextBar } from './session-context-bar';
import { TooltipProvider } from '@/components/ui/tooltip';

const render = (ui: ReactElement) => renderElement(ui, { wrapper: TooltipProvider });
const downloads = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/tauri/downloads', () => ({ openDownloads: downloads.open }));
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
        onReturnToParent={vi.fn()}
        onShare={vi.fn()}
        onUndo={vi.fn()}
        session={{ ...session, session_kind: kind, parent_session_id: 'parent' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: `Actions for ${session.title}` }));
    expect(screen.queryByRole('menuitem', { name: 'Fork' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Share' })).toBeVisible();
    expect(onFork).not.toHaveBeenCalled();
  });

  it('opens native Downloads from the desktop toolbar', async () => {
    const user = userEvent.setup();
    mockDesktopHost();
    try {
      render(
        <ClioSessionContextBar
          actionsPending={false}
          onCompact={vi.fn()}
          onFork={vi.fn()}
          onReturnToParent={vi.fn()}
          onShare={vi.fn()}
          onUndo={vi.fn()}
          session={session}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Open downloads' }));
      expect(downloads.open).toHaveBeenCalledOnce();
    } finally {
      clearDesktopHost();
    }
  });

  it('hides native Downloads in a browser', () => {
    render(
      <ClioSessionContextBar
        actionsPending={false}
        onCompact={vi.fn()}
        onFork={vi.fn()}
        onReturnToParent={vi.fn()}
        onShare={vi.fn()}
        onUndo={vi.fn()}
        session={session}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Open downloads' })).toBeNull();
  });

  it('keeps conversation actions in Tauri while the native window owns the passive title', () => {
    mockDesktopHost();
    try {
      render(
        <ClioSessionContextBar
          actionsPending={false}
          onCompact={vi.fn()}
          onFork={vi.fn()}
          onReturnToParent={vi.fn()}
          onShare={vi.fn()}
          onUndo={vi.fn()}
          session={session}
        />,
      );

      expect(screen.queryByRole('heading', { name: session.title })).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: `Actions for ${session.title}` }),
      ).toBeInTheDocument();
    } finally {
      clearDesktopHost();
    }
  });
});
