import type { Workspace } from '@clio/core/v3';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceEditorDialog, type WorkspaceEditorActions } from './workspace-editor-dialog';

const workspace: Workspace = {
  id: 'research',
  name: 'Research',
  display_name: 'Research',
  path: 'C:\\Classes\\Research',
  connection_id: 'local',
  pinned: false,
  source_folders: [{ name: 'Research', path: 'C:\\Classes\\Research', primary: true }],
};

function actions(): WorkspaceEditorActions {
  return {
    updateWorkspace: vi.fn().mockResolvedValue(undefined),
    grantWorkspaceFolder: vi.fn().mockResolvedValue(undefined),
    revokeWorkspaceFolder: vi.fn().mockResolvedValue(undefined),
  };
}

afterEach(cleanup);

it('shows a folder approved while open and preserves it when saving unrelated edits', async () => {
  const user = userEvent.setup();
  const handlers = actions();
  const onClose = vi.fn();
  const view = render(
    <WorkspaceEditorDialog actions={handlers} workspace={workspace} onClose={onClose} />,
  );
  await user.clear(screen.getByLabelText('Workspace name'));
  await user.type(screen.getByLabelText('Workspace name'), 'Renamed research');
  view.rerender(
    <WorkspaceEditorDialog
      actions={handlers}
      workspace={{
        ...workspace,
        source_folders: [
          ...workspace.source_folders!,
          { name: 'Final_thesis', path: 'C:\\Documents\\Final_thesis', primary: false },
        ],
      }}
      onClose={onClose}
    />,
  );
  expect(screen.getByRole('button', { name: 'Remove folder Final_thesis' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Save workspace' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(handlers.updateWorkspace).toHaveBeenCalledWith('research', {
    name: 'Renamed research',
    root_path: workspace.path,
  });
  expect(handlers.revokeWorkspaceFolder).not.toHaveBeenCalled();
  expect(handlers.grantWorkspaceFolder).not.toHaveBeenCalled();
});

it('merges incoming grants with a draft addition and an explicit draft removal', async () => {
  const user = userEvent.setup();
  const handlers = actions();
  const saved: Workspace = {
    ...workspace,
    source_folders: [
      ...workspace.source_folders!,
      { name: 'Old', path: 'C:\\Old', primary: false },
    ],
  };
  const view = render(
    <WorkspaceEditorDialog actions={handlers} workspace={saved} onClose={vi.fn()} />,
  );
  await user.click(screen.getByRole('button', { name: 'Remove folder Old' }));
  await user.type(screen.getByRole('textbox', { name: 'Additional folder path' }), 'C:\\Draft');
  await user.click(screen.getByRole('button', { name: 'Add folder' }));
  view.rerender(
    <WorkspaceEditorDialog
      actions={handlers}
      workspace={{
        ...saved,
        source_folders: [
          ...saved.source_folders!,
          { name: 'Approved', path: 'C:\\Approved', primary: false },
        ],
      }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Remove folder Approved' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Remove folder Draft' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Save workspace' }));
  await waitFor(() => expect(handlers.revokeWorkspaceFolder).toHaveBeenCalledOnce());
  expect(handlers.revokeWorkspaceFolder).toHaveBeenCalledWith('research', 'C:\\Old');
  expect(handlers.grantWorkspaceFolder).toHaveBeenCalledTimes(1);
  expect(handlers.grantWorkspaceFolder).toHaveBeenCalledWith('research', 'C:\\Draft');
});

it('reflects an externally revoked folder without granting it again on Save', async () => {
  const user = userEvent.setup();
  const handlers = actions();
  const view = render(
    <WorkspaceEditorDialog
      actions={handlers}
      workspace={{
        ...workspace,
        source_folders: [
          ...workspace.source_folders!,
          { name: 'Revoked', path: 'C:\\Revoked', primary: false },
        ],
      }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Remove folder Revoked' })).toBeVisible();
  view.rerender(
    <WorkspaceEditorDialog actions={handlers} workspace={workspace} onClose={vi.fn()} />,
  );
  expect(screen.queryByRole('button', { name: 'Remove folder Revoked' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Save workspace' }));
  expect(handlers.grantWorkspaceFolder).not.toHaveBeenCalled();
});

it('saves a pasted additional path directly without a manual-entry toggle or Add', async () => {
  const user = userEvent.setup();
  const handlers = actions();
  const onClose = vi.fn();
  render(<WorkspaceEditorDialog actions={handlers} workspace={workspace} onClose={onClose} />);
  expect(screen.queryByRole('button', { name: 'Enter a path instead' })).toBeNull();
  await user.click(screen.getByRole('textbox', { name: 'Additional folder path' }));
  await user.paste('C:\\Shared');
  await user.click(screen.getByRole('button', { name: 'Save workspace' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(handlers.grantWorkspaceFolder).toHaveBeenCalledTimes(1);
  expect(handlers.grantWorkspaceFolder).toHaveBeenCalledWith('research', 'C:\\Shared');
  expect(handlers.updateWorkspace).not.toHaveBeenCalled();
});

it('saves the primary path and name together on the same workspace', async () => {
  const user = userEvent.setup();
  const handlers = actions();
  render(<WorkspaceEditorDialog actions={handlers} workspace={workspace} onClose={vi.fn()} />);
  const primary = screen.getByRole('textbox', { name: 'Primary folder path' });
  await user.clear(primary);
  await user.type(primary, 'C:\\Research');
  await user.clear(screen.getByLabelText('Workspace name'));
  await user.type(screen.getByLabelText('Workspace name'), 'Moved research');
  await user.click(screen.getByRole('button', { name: 'Save workspace' }));
  expect(handlers.updateWorkspace).toHaveBeenCalledTimes(1);
  expect(handlers.updateWorkspace).toHaveBeenCalledWith('research', {
    name: 'Moved research',
    root_path: 'C:\\Research',
  });
});

it('keeps edits and the failure visible when the primary change is rejected', async () => {
  const user = userEvent.setup();
  const handlers = actions();
  vi.mocked(handlers.updateWorkspace).mockRejectedValue(new Error('Finish running conversations'));
  const onClose = vi.fn();
  render(<WorkspaceEditorDialog actions={handlers} workspace={workspace} onClose={onClose} />);
  const primary = screen.getByRole('textbox', { name: 'Primary folder path' });
  await user.clear(primary);
  await user.type(primary, 'C:\\Research');
  await user.click(screen.getByRole('button', { name: 'Save workspace' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Finish running conversations');
  expect(primary).toHaveValue('C:\\Research');
  expect(onClose).not.toHaveBeenCalled();
  expect(handlers.grantWorkspaceFolder).not.toHaveBeenCalled();
});

it('removes a persisted additional grant and never deletes files', async () => {
  const user = userEvent.setup();
  const handlers = actions();
  const saved: Workspace = {
    ...workspace,
    source_folders: [
      ...workspace.source_folders!,
      { name: 'Shared', path: 'C:\\Shared', primary: false },
    ],
  };
  render(<WorkspaceEditorDialog actions={handlers} workspace={saved} onClose={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Remove folder Shared' }));
  await user.click(screen.getByRole('button', { name: 'Save workspace' }));
  expect(handlers.revokeWorkspaceFolder).toHaveBeenCalledTimes(1);
  expect(handlers.revokeWorkspaceFolder).toHaveBeenCalledWith('research', 'C:\\Shared');
});

it('does not duplicate a folder after Add and refuses a blank primary path', async () => {
  const user = userEvent.setup();
  const handlers = actions();
  render(<WorkspaceEditorDialog actions={handlers} workspace={workspace} onClose={vi.fn()} />);
  await user.type(screen.getByRole('textbox', { name: 'Additional folder path' }), 'C:\\Shared');
  await user.click(screen.getByRole('button', { name: 'Add folder' }));
  await user.type(screen.getByRole('textbox', { name: 'Additional folder path' }), 'C:\\Shared');
  await user.click(screen.getByRole('button', { name: 'Save workspace' }));
  expect(handlers.grantWorkspaceFolder).toHaveBeenCalledTimes(1);
  await user.clear(screen.getByRole('textbox', { name: 'Primary folder path' }));
  expect(screen.getByRole('button', { name: 'Save workspace' })).toBeDisabled();
});
