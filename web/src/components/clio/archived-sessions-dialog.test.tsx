import type { Session, Workspace } from '@clio/core/v3';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioArchivedSessionsDialog } from './archived-sessions-dialog';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(cleanup);

const workspace: Workspace = {
  id: 'ws_ndp',
  name: 'ndp',
  display_name: 'EarthScope NDP',
  path: 'D:\\science\\earthscope',
  connection_id: 'local',
  pinned: false,
};

const session: Session = {
  id: 'sess_archived',
  workspace_id: workspace.id,
  title: 'Older station review',
  state: 'completed',
  created_at: '2026-08-01T12:00:00Z',
  updated_at: '2026-08-02T12:00:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: true,
};

describe('ClioArchivedSessionsDialog', () => {
  it('restores or permanently deletes archived sessions without exposing workspace paths', async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <ClioArchivedSessionsDialog
        onDelete={onDelete}
        onOpenChange={vi.fn()}
        onRestore={onRestore}
        open
        sessions={[session]}
        workspaces={[workspace]}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('EarthScope NDP');
    expect(screen.getByRole('dialog')).not.toHaveTextContent(workspace.path);
    await user.click(screen.getByRole('button', { name: 'Restore Older station review' }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(session.id));

    await user.click(screen.getByRole('button', { name: 'Delete Older station review' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('This cannot be undone.');
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(session.id));
  });
});
