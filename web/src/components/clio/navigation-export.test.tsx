import type { Session, Workspace } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { afterEach, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ResourceActions } from './resource-dialogs';

const nativeDownloads = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/tauri/downloads', () => ({ openDownloads: nativeDownloads }));
vi.mock('@/tauri/menu-actions', () => ({ useMenuAction: vi.fn() }));
vi.mock('@/hooks/use-switch-connection', () => ({ useSwitchConnection: () => vi.fn() }));
vi.mock('@/hooks/use-connection-availability', () => ({ useConnectionAvailabilities: () => ({}) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://localhost/proxy/', label: 'Test' },
    recents: [],
  }),
}));
vi.mock('./navigation-header', () => ({ NavigationHeader: () => null }));
vi.mock('./navigation-infrastructure', () => ({ NavigationInfrastructure: () => null }));
vi.mock('./attention-center', () => ({
  ClioAttentionCenter: () => null,
  ClioAttentionNotifier: () => null,
}));
vi.mock('./resource-dialogs', () => ({ ClioResourceDialogs: () => null }));
vi.mock('./archived-sessions-dialog', () => ({ ClioArchivedSessionsDialog: () => null }));
import { ClioNavigation } from './navigation';

const workspace: Workspace = {
  id: 'ws_export',
  name: 'Exports',
  display_name: 'Exports',
  path: '/workspace',
  connection_id: 'local',
  pinned: false,
};
const session: Session = {
  id: 'sess_export',
  workspace_id: workspace.id,
  title: 'Export example',
  state: 'completed',
  created_at: '2026-10-08T00:00:00Z',
  updated_at: '2026-10-08T01:00:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  nativeDownloads.mockClear();
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

it.each([
  ['transcript', 'html', true],
  ['effects', 'zip', true],
  ['full', 'zip', true],
  ['transcript', 'html', false],
  ['effects', 'zip', false],
  ['full', 'zip', false],
] as const)(
  'downloads %s as %s through the common handler (desktop=%s)',
  async (mode, extension, desktop) => {
    if (desktop)
      Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    const filename = `export-example.${extension}`;
    const exportSession = vi
      .fn()
      .mockResolvedValue({ download_path: '/v1/session-export/file', filename });
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
      exportSession,
      importSession: vi.fn(),
    };
    const clicked: HTMLAnchorElement[] = [];
    const preparing = vi.spyOn(toast, 'loading');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    render(
      <MemoryRouter>
        <TooltipProvider>
          <SidebarProvider>
            <ClioNavigation
              endpoint="http://localhost/proxy/"
              workspaces={[workspace]}
              sessions={[session]}
              activeWorkspaceId={workspace.id}
              activeSessionId={session.id}
              actions={actions}
              blueprints={[]}
              attentions={{}}
            />
          </SidebarProvider>
        </TooltipProvider>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Session actions for Export example' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export session' }));
    await screen.findByRole('menuitem', { name: 'Download HTML' });
    if (mode !== 'transcript')
      fireEvent.click(
        screen.getByRole('menuitemcheckbox', {
          name: mode === 'full' ? 'Include workspace files' : 'Include session artifacts',
        }),
      );
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: extension === 'html' ? 'Download HTML' : 'Download ZIP',
      }),
    );
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(exportSession).toHaveBeenCalledWith(session.id, mode);
    expect(preparing).toHaveBeenCalledWith(
      `Preparing ${extension === 'html' ? 'HTML' : 'ZIP'} export for Export example…`,
    );
    expect(clicked[0].href).toBe('http://localhost/proxy/v1/session-export/file');
    expect(clicked[0].download).toBe(filename);
    expect(clicked[0].referrerPolicy).toBe('no-referrer');
    expect(nativeDownloads).toHaveBeenCalledTimes(desktop ? 1 : 0);
  },
);
