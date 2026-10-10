import type { Session } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { ResourceActions } from './resource-dialogs';
import { ClioSessionActions } from './session-actions';
import { downloadUrl } from './surface-export';

vi.mock('./surface-export', () => ({ downloadUrl: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

const session: Session = {
  id: 'sess_menu',
  workspace_id: 'ws_demo',
  title: 'Session review',
  state: 'completed',
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup(pinned = false) {
  const actions: ResourceActions = {
    createWorkspace: vi.fn(),
    createSession: vi.fn(),
    renameWorkspace: vi.fn(),
    grantWorkspaceFolder: vi.fn(),
    revokeWorkspaceFolder: vi.fn(),
    renameSession: vi.fn().mockResolvedValue(undefined),
    setWorkspacePinned: vi.fn(),
    setSessionPinned: vi.fn().mockResolvedValue(undefined),
    archiveSession: vi.fn().mockResolvedValue(undefined),
    restoreSession: vi.fn(),
    deleteWorkspace: vi.fn(),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    exportSession: vi.fn().mockResolvedValue({
      download_path: '/v1/session-export-downloads/abc',
      filename: 'review.html',
    }),
    importSession: vi.fn(),
  };
  render(
    <ClioSessionActions
      title={session.title}
      management={{
        session: { ...session, pinned },
        actions,
        endpoint: 'http://localhost:8100/proxy',
      }}
      onFork={vi.fn()}
      onCompact={vi.fn()}
      onShare={vi.fn()}
      onUndo={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  const open = () =>
    user.click(screen.getByRole('button', { name: `Actions for ${session.title}` }));
  return { actions, user, open };
}

it('renames from the header using the shared resource dialog', async () => {
  const { actions, user, open } = setup();
  await open();
  await user.click(screen.getByRole('menuitem', { name: 'Rename session' }));
  await user.clear(screen.getByRole('textbox', { name: 'Name' }));
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Renamed review');
  await user.click(screen.getByRole('button', { name: 'Save name' }));
  expect(actions.renameSession).toHaveBeenCalledWith(session.id, 'Renamed review');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it.each([false, true])('toggles the authoritative pinned state from %s', async (pinned) => {
  const { actions, user, open } = setup(pinned);
  await open();
  await user.click(
    screen.getByRole('menuitem', { name: pinned ? 'Unpin session' : 'Pin session' }),
  );
  expect(actions.setSessionPinned).toHaveBeenCalledWith(session.id, !pinned);
});

it('archives the session through the shared navigation action', async () => {
  const { actions, user, open } = setup();
  await open();
  await user.click(screen.getByRole('menuitem', { name: 'Archive session' }));
  expect(actions.archiveSession).toHaveBeenCalledWith(session.id);
});

it('requires the existing permanent deletion confirmation and keeps failures visible', async () => {
  const { actions, user, open } = setup();
  vi.mocked(actions.deleteSession).mockRejectedValueOnce(new Error('Service unavailable'));
  await open();
  await user.click(screen.getByRole('menuitem', { name: 'Delete session' }));
  expect(actions.deleteSession).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog')).toHaveTextContent('permanently removes the session');
  await user.click(screen.getByRole('button', { name: 'Remove session' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Service unavailable');
  expect(screen.getByRole('alertdialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Remove session' }));
  expect(actions.deleteSession).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
});

it('reports pin failures without an unhandled rejection', async () => {
  const { actions, user, open } = setup();
  vi.mocked(actions.setSessionPinned).mockRejectedValueOnce(new Error('Pin failed'));
  await open();
  await user.click(screen.getByRole('menuitem', { name: 'Pin session' }));
  expect(toast.error).toHaveBeenCalledWith(
    'Pin failed',
    expect.objectContaining({ closeButton: true }),
  );
  expect(screen.getByRole('button', { name: `Actions for ${session.title}` })).toBeEnabled();
});

it('exports HTML through the shared download flow and retains the service base path', async () => {
  const { actions, user, open } = setup();
  await open();
  await user.click(screen.getByRole('menuitem', { name: 'Export session' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Download HTML' }));
  expect(actions.exportSession).toHaveBeenCalledWith(session.id, 'transcript');
  await waitFor(() =>
    expect(downloadUrl).toHaveBeenCalledWith(
      'http://localhost:8100/proxy/v1/session-export-downloads/abc',
      'review.html',
    ),
  );
  expect(toast.dismiss).toHaveBeenCalled();
});

it('shows export failures and does not start a download', async () => {
  const { actions, user, open } = setup();
  vi.mocked(actions.exportSession).mockRejectedValueOnce(new Error('Export failed'));
  await open();
  await user.click(screen.getByRole('menuitem', { name: 'Export session' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Download HTML' }));
  expect(downloadUrl).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      'Export failed',
      expect.objectContaining({ closeButton: true }),
    ),
  );
  expect(toast.dismiss).toHaveBeenCalled();
});
