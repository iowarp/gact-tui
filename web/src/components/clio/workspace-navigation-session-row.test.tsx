import type { Session } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ResourceActions } from './resource-dialogs';
import { SessionNavigationRow } from './workspace-navigation-session-row';

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

function renderRow(row: Session, seenRevision?: string) {
  return render(
    <MemoryRouter>
      <SessionNavigationRow
        actions={actions}
        activeSessionId="sess_active"
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

  it('uses a labeled working state and otherwise exposes interaction recency', () => {
    const { rerender } = renderRow({ ...session, state: 'running' }, session.last_interaction_at);
    expect(screen.getByText('Working')).toBeVisible();

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

    expect(screen.queryByText('Working')).not.toBeInTheDocument();
    expect(screen.queryByText('New')).not.toBeInTheDocument();
    expect(screen.getByTitle(/^Last interaction /u)).toBeVisible();
  });

  it('does not pin the hover preview after mouse navigation', async () => {
    const user = userEvent.setup();
    renderRow(session, session.last_interaction_at);
    const link = screen.getByRole('link', { name: /Evidence review/u });

    await user.click(link);

    expect(link).not.toHaveFocus();
  });
});
