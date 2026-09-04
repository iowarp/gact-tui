import type { Session } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ResourceActions } from './resource-dialogs';
import { SessionNavigationRow } from './workspace-navigation-session-row';
import type { SessionAttention } from '@/lib/session-attention';

const actions: ResourceActions = {
  createWorkspace: vi.fn(),
  createSession: vi.fn(),
  renameWorkspace: vi.fn(),
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

afterEach(cleanup);

describe('session navigation state', () => {
  it('labels completed activity that arrived after the session was last seen', () => {
    renderRow(session, '2026-08-23T01:05:00Z');

    expect(screen.getByText('New')).toBeVisible();
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
    expect(screen.queryByText('New')).not.toBeInTheDocument();
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
});
