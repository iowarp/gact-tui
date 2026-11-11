import type { Session } from '@clio/core/v3';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ResourceActions } from './resource-dialogs';
import { SessionNavigationRow } from './workspace-navigation-session-row';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { SessionAttention } from '@/lib/session-attention';

// The Move to submenu reads service capabilities through the ConnectionProvider the app supplies.
vi.mock('@/hooks/use-session-move', () => ({
  useSessionMoveSupported: () => false,
  useSessionMoveTargets: () => ({ data: undefined }),
}));

const actions: ResourceActions = {
  createWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
  updateWorkspace: vi.fn().mockResolvedValue(undefined),
  grantWorkspaceFolder: vi.fn(),
  revokeWorkspaceFolder: vi.fn(),
  renameSession: vi.fn(),
  setWorkspacePinned: vi.fn(),
  setSessionPinned: vi.fn(),
  archiveSession: vi.fn(),
  restoreSession: vi.fn(),
  deleteWorkspace: vi.fn(),
  deleteSession: vi.fn(),
  exportSession: vi.fn(),
  importSession: vi.fn(),
};

const session: Session = {
  id: 'sess_review',
  workspace_id: 'ws_ndp',
  title: 'Evidence review',
  state: 'completed',
  created_at: '2026-08-23T00:00:00Z',
  updated_at: '2026-08-23T01:00:00Z',
  last_interaction_at: '2026-08-23T01:10:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
};

function renderRow(row: Session, seenRevision?: string, attention?: SessionAttention) {
  return render(
    <MemoryRouter>
      <SessionNavigationRow
        actions={actions}
        activeSessionId="sess_active"
        attention={attention}
        onAction={vi.fn()}
        onDelete={vi.fn()}
        onDownloadSession={vi.fn().mockResolvedValue(undefined)}
        onRename={vi.fn()}
        onVisit={vi.fn()}
        seenRevision={seenRevision}
        session={row}
        workspaceId="ws_ndp"
      />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  // A row click holds previews until the pointer really moves; release it so tests stay independent.
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1000, clientY: 1000 }));
});

describe('session navigation state', () => {
  it('labels completed activity that arrived after the session was last seen', () => {
    renderRow(session, '2026-08-23T01:05:00Z');

    expect(screen.getByText(/New activity/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Evidence review/u })).toBeVisible();
  });

  it('uses one accessible loop for working state and otherwise exposes interaction recency', () => {
    const { rerender } = renderRow({ ...session, state: 'running' }, session.last_interaction_at);
    expect(screen.getByRole('status', { name: 'Working now' })).toBeVisible();
    expect(screen.queryByText('Working')).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <SessionNavigationRow
          actions={actions}
          activeSessionId="sess_active"
          onAction={vi.fn()}
          onDelete={vi.fn()}
          onDownloadSession={vi.fn().mockResolvedValue(undefined)}
          onRename={vi.fn()}
          onVisit={vi.fn()}
          seenRevision={session.last_interaction_at}
          session={session}
          workspaceId="ws_ndp"
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('status', { name: 'Working now' })).not.toBeInTheDocument();
    expect(screen.queryByText(/New activity/u)).not.toBeInTheDocument();
    expect(screen.getByTitle(/^Last interaction /u)).toBeVisible();
  });

  it('prioritizes a response blocker and separates its hover-card semantics', async () => {
    const user = userEvent.setup();
    renderRow({ ...session, state: 'running' }, session.last_interaction_at, {
      sessionId: session.id,
      permissionIds: ['perm_1'],
      questionIds: ['question_1'],
      mcpTaskInputIds: [],
      a2uiIds: [],
      unknownIds: [],
      total: 2,
    });

    expect(
      screen.getByRole('status', { name: 'Needs your response: 1 permission and 1 question' }),
    ).toBeVisible();
    expect(screen.queryByRole('status', { name: 'Working now' })).not.toBeInTheDocument();

    await user.hover(screen.getByRole('link', { name: /Evidence review/u }));

    expect(await screen.findByText('Response needed')).toBeVisible();
    expect(screen.getByText('Approval')).toBeVisible();
    expect(screen.getByText('Question')).toBeVisible();
    expect(
      screen.queryByRole('status', { name: 'Work continues in the background' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Needs your response · 1 permission and 1 question · Work continues in the background',
      ),
    ).not.toBeInTheDocument();
  });

  it('does not pin the hover preview after mouse navigation', async () => {
    const user = userEvent.setup();
    renderRow(session, session.last_interaction_at);
    const link = screen.getByRole('link', { name: /Evidence review/u });

    await user.click(link);

    expect(link).not.toHaveFocus();
  });

  it('uses the shared product vocabulary in the hover preview', async () => {
    const user = userEvent.setup();
    renderRow(session, session.last_interaction_at);

    await user.hover(screen.getByRole('link', { name: /Evidence review/u }));

    expect(await screen.findByText('Work mode')).toBeVisible();
    expect(screen.getByText('Execute')).toBeVisible();
    expect(screen.queryByText('Routing')).not.toBeInTheDocument();
  });

  it('keeps session details out of the row and reveals them on hover', async () => {
    const user = userEvent.setup();
    const empty = { ...session, id: 'sess_empty', message_count: 0 };
    const withTranscript = {
      ...session,
      id: 'sess_transcript',
      created_at: '2026-08-23T00:05:00Z',
      message_count: 2,
    };
    const started = (value: string) =>
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      );

    renderRow(empty);
    expect(screen.queryByText('No messages yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Started')).not.toBeInTheDocument();
    await user.hover(screen.getByRole('link', { name: /Evidence review/u }));
    expect(await screen.findByText('No messages yet')).toBeVisible();
    expect(screen.getByText('Started')).toBeVisible();
    expect(screen.getByText(started(empty.created_at))).toBeVisible();
    cleanup();

    renderRow(withTranscript);
    expect(screen.queryByText('2 messages')).not.toBeInTheDocument();
    expect(screen.queryByText('Started')).not.toBeInTheDocument();
    await user.hover(screen.getByRole('link', { name: /Evidence review/u }));
    expect(await screen.findByText('2 messages')).toBeVisible();
    expect(screen.getByText(started(withTranscript.created_at))).toBeVisible();
  });

  it('keeps a uniquely named row on one line', () => {
    renderRow({ ...session, message_count: 0 });

    expect(screen.queryByText('No messages yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Started')).not.toBeInTheDocument();
  });
});

describe('row menu', () => {
  function renderMenuRow(
    rowActions: ResourceActions,
    row: Session = session,
    workspacePath?: string,
  ) {
    const onAction = vi.fn((action: () => Promise<void>) => void action());
    render(
      <MemoryRouter>
        <TooltipProvider>
          <SessionNavigationRow
            actions={rowActions}
            activeSessionId="sess_active"
            onAction={onAction}
            onDelete={vi.fn()}
            onDownloadSession={vi.fn().mockResolvedValue(undefined)}
            onRename={vi.fn()}
            onVisit={vi.fn()}
            session={row}
            workspaceId="ws_ndp"
            workspacePath={workspacePath}
          />
        </TooltipProvider>
      </MemoryRouter>,
    );
    return onAction;
  }

  it('offers the title menu’s fork and share, in the spec’s order', async () => {
    const user = userEvent.setup();
    const forkSession = vi.fn().mockResolvedValue(undefined);
    const shareSession = vi.fn().mockResolvedValue('https://clio.test/share/abc');
    renderMenuRow({ ...actions, forkSession, shareSession });

    await user.click(screen.getByRole('button', { name: 'Session actions for Evidence review' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^Open/u),
      expect.stringMatching(/^Pin/u),
      expect.stringMatching(/^Rename/u),
      expect.stringMatching(/^Fork into a new conversation/u),
      expect.stringMatching(/^Share read-only link/u),
      expect.stringMatching(/^Export/u),
      expect.stringMatching(/^Archive/u),
      expect.stringMatching(/^Delete/u),
    ]);

    await user.click(screen.getByRole('menuitem', { name: /Fork into a new conversation/u }));
    expect(forkSession).toHaveBeenCalledWith('sess_review');

    await user.click(screen.getByRole('button', { name: 'Session actions for Evidence review' }));
    await user.click(screen.getByRole('menuitem', { name: /Share read-only link/u }));
    const dialog = await screen.findByRole('dialog', { name: 'Share Evidence review' });
    await user.click(within(dialog).getByRole('button', { name: 'Create share link' }));
    expect(shareSession).toHaveBeenCalledWith('sess_review', 604800);
    expect(await within(dialog).findByDisplayValue('https://clio.test/share/abc')).toBeVisible();
  });

  it('leaves out fork for an agent’s own conversation and both without the actions', async () => {
    const user = userEvent.setup();
    renderMenuRow({ ...actions, forkSession: vi.fn(), shareSession: vi.fn() }, {
      ...session,
      session_kind: 'agent',
    } as Session);
    await user.click(screen.getByRole('button', { name: 'Session actions for Evidence review' }));
    expect(screen.queryByRole('menuitem', { name: /Fork/u })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /Share read-only link/u })).toBeVisible();
    cleanup();

    renderMenuRow(actions);
    await user.click(screen.getByRole('button', { name: 'Session actions for Evidence review' }));
    expect(screen.queryByRole('menuitem', { name: /Fork/u })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Share/u })).toBeNull();
  });

  it('opens the system terminal at the workspace folder only when desktop knows it', async () => {
    const user = userEvent.setup();
    const openSystemTerminal = vi.fn().mockResolvedValue(undefined);
    renderMenuRow({ ...actions, openSystemTerminal }, session, 'D:\\data\\ndp');
    await user.click(screen.getByRole('button', { name: 'Session actions for Evidence review' }));
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items.findIndex((label) => /^Open in system terminal/u.test(label ?? ''))).toBe(
      items.findIndex((label) => /^Archive/u.test(label ?? '')) - 1,
    );
    await user.keyboard('t');
    expect(openSystemTerminal).toHaveBeenCalledWith('D:\\data\\ndp');
    cleanup();

    renderMenuRow({ ...actions, openSystemTerminal });
    await user.click(screen.getByRole('button', { name: 'Session actions for Evidence review' }));
    expect(screen.queryByRole('menuitem', { name: /system terminal/u })).toBeNull();
  });

  it('opens the same menu on right-click and hides the hover card while it is open', async () => {
    const user = userEvent.setup();
    renderMenuRow({ ...actions, forkSession: vi.fn(), shareSession: vi.fn() });
    const link = screen.getByRole('link', { name: /Evidence review/u });

    await user.hover(link);
    expect(await screen.findByText('Work mode')).toBeVisible();

    await user.pointer({ keys: '[MouseRight]', target: link });
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Open/u),
        expect.stringMatching(/^Fork into a new conversation/u),
        expect.stringMatching(/^Share read-only link/u),
        expect.stringMatching(/^Delete/u),
      ]),
    );
    expect(screen.queryByText('Work mode')).toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('hides the hover card while the ⋯ menu is open', async () => {
    const user = userEvent.setup();
    renderMenuRow(actions);
    await user.hover(screen.getByRole('link', { name: /Evidence review/u }));
    expect(await screen.findByText('Work mode')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Session actions for Evidence review' }));
    expect(screen.getByRole('menu')).toBeVisible();
    expect(screen.queryByText('Work mode')).toBeNull();
  });

  it('offers the title menu’s Compact and Remove last after the terminal, each confirmed', async () => {
    const user = userEvent.setup();
    const compactSession = vi.fn().mockResolvedValue(undefined);
    const undoSession = vi.fn().mockResolvedValue(undefined);
    renderMenuRow(
      { ...actions, openSystemTerminal: vi.fn(), compactSession, undoSession },
      session,
      'D:\\data\\ndp',
    );
    const openMenu = () =>
      user.click(screen.getByRole('button', { name: 'Session actions for Evidence review' }));

    await openMenu();
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
    const at = (pattern: RegExp) => items.findIndex((label) => pattern.test(label));
    expect(at(/^Compact conversation…C$/u)).toBe(at(/^Open in system terminal/u) + 1);
    expect(at(/^Remove last message…V$/u)).toBe(at(/^Compact/u) + 1);
    expect(at(/^Archive/u)).toBe(at(/^Remove last/u) + 1);

    await user.keyboard('c');
    let dialog = await screen.findByRole('alertdialog', { name: 'Compact this conversation?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(compactSession).not.toHaveBeenCalled();

    await openMenu();
    await user.click(screen.getByRole('menuitem', { name: /Compact conversation/u }));
    dialog = await screen.findByRole('alertdialog', { name: 'Compact this conversation?' });
    await user.click(within(dialog).getByRole('button', { name: 'Compact conversation' }));
    expect(compactSession).toHaveBeenCalledWith('sess_review');
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await openMenu();
    await user.click(screen.getByRole('menuitem', { name: /Remove last message/u }));
    dialog = await screen.findByRole('alertdialog', { name: 'Remove last message?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove message' }));
    expect(undoSession).toHaveBeenCalledWith('sess_review');
  });

  it('keeps a refused Remove last open and names the failure', async () => {
    const user = userEvent.setup();
    const undoSession = vi.fn().mockRejectedValue(new Error('nothing to remove'));
    renderMenuRow({ ...actions, compactSession: vi.fn(), undoSession });
    await user.click(screen.getByRole('button', { name: 'Session actions for Evidence review' }));
    await user.click(screen.getByRole('menuitem', { name: /Remove last message/u }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove last message?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove message' }));
    expect(undoSession).toHaveBeenCalledWith('sess_review');
    expect(within(dialog).getByRole('button', { name: 'Remove message' })).toBeEnabled();
  });
});

describe('agent fork row', () => {
  it('names the agent as the author of a fork of the conversation', () => {
    renderRow({
      ...session,
      id: 'sess_fork',
      title: 'Evidence review (fork)',
      parent_session_id: 'sess_review',
      session_kind: 'branch',
      metadata: {
        fork_origin: {
          session_id: 'sess_review',
          message_id: 'msg_1',
          message_count: 3,
          created_at: '2026-08-23T01:00:00Z',
          author: { kind: 'agent', agent_id: 'clio/standard' },
          note: 'pursue H4 instead',
        },
      },
    } as Session);
    expect(screen.getByText('Forked by the agent: pursue H4 instead')).toBeVisible();
    // The fork mark beside the title says the same, not an unexplained icon.
    expect(screen.getAllByTitle('Forked by the agent: pursue H4 instead')).toHaveLength(2);
  });
});
