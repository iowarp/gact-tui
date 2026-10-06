import type { Workspace } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ResourceActions } from './resource-dialogs';
import { WorkspaceNavigation } from './workspace-navigation';

afterEach(cleanup);

it('keeps workspace disclosure separate from the common action and overflow menu', async () => {
  const user = userEvent.setup();
  const onCreateSession = vi.fn();
  const onEditWorkspace = vi.fn();
  const workspace: Workspace = {
    id: 'ws_reports',
    name: 'reports',
    display_name: 'Reports',
    path: 'D:/science/reports',
    connection_id: 'local',
    pinned: false,
  };
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
  render(
    <MemoryRouter>
      <TooltipProvider>
        <SidebarProvider>
          <WorkspaceNavigation
            actions={actions}
            activeSessionId=""
            activeWorkspaceId={workspace.id}
            attentions={{}}
            blueprints={[]}
            onAction={vi.fn()}
            onCreateSession={onCreateSession}
            onDelete={vi.fn()}
            onDownloadSession={vi.fn().mockResolvedValue(undefined)}
            onEditWorkspace={onEditWorkspace}
            onRename={vi.fn()}
            sessions={[]}
            workspaces={[workspace]}
          />
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );

  const disclosure = screen.getByRole('button', { name: 'Collapse workspace Reports' });
  expect(screen.getByText('No sessions')).toBeVisible();
  await user.click(disclosure);
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');

  await user.click(screen.getByRole('button', { name: 'New session in Reports' }));
  expect(onCreateSession).toHaveBeenCalledTimes(1);
  expect(onCreateSession).toHaveBeenCalledWith(workspace.id);
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');

  await user.click(screen.getByRole('button', { name: 'Workspace actions for Reports' }));
  expect(screen.queryByRole('menuitem', { name: 'New session' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('menuitem', { name: 'Edit workspace' }));
  expect(onEditWorkspace).toHaveBeenCalledTimes(1);
  expect(onEditWorkspace).toHaveBeenCalledWith(workspace.id);
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
});
