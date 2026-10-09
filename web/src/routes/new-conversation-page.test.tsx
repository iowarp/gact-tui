import type { ReactNode } from 'react';
import type { ClioComposerProps } from '@/components/clio/composer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewConversationPage } from './new-conversation-page';

const mocks = vi.hoisted(() => ({
  openFile: vi.fn(),
  revealWorkbench: vi.fn(),
  downloads: vi.fn().mockResolvedValue(undefined),
  error: vi.fn(),
}));
vi.mock('@/tauri/downloads', () => ({ openDownloads: mocks.downloads }));
vi.mock('@/hooks/use-connection-indicator-state', () => ({
  useConnectionIndicatorState: () => 'live',
}));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ workspaceId: 'workspace_demo' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: mocks.error } }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({
    sessionDefaults: async () => ({ provider_id: 'codex', model_id: 'gpt-6-luna' }),
  }),
}));
vi.mock('@/hooks/use-composer-draft', () => ({
  useComposerDraft: () => ({
    value: '',
    references: [],
    onValueChange: vi.fn(),
    onReferencesChange: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-workspace-data', () => ({
  useWorkspaceData: () => ({
    workspaces: { data: [{ id: 'workspace_demo', display_name: 'Demo', path: '/demo' }] },
    capabilities: { data: { capabilities: {} } },
    allSessions: { data: [] },
    sessions: { data: [] },
    attentionInteractions: [],
    workspaceFiles: {},
    workspaceResources: { data: [] },
    agentBlueprints: {},
    providerCatalog: {},
  }),
}));
vi.mock('@/hooks/use-workbench-navigation', () => ({
  useWorkbenchNavigation: () => ({
    openWorkspaceFile: mocks.openFile,
    revealWorkbench: mocks.revealWorkbench,
  }),
}));
vi.mock('@/hooks/use-session-mutations', () => ({
  useSessionMutations: () => ({
    send: { isPending: false },
    prepareFiles: vi.fn(),
    discardFiles: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-session-diff-actions', () => ({
  useSessionDiffActions: () => ({ apply: {}, reject: {} }),
}));
vi.mock('@/hooks/use-workspace-navigation-actions', () => ({
  useWorkspaceNavigationActions: () => ({ navigationActions: {} }),
}));
vi.mock('@/hooks/use-workspace-terminal-actions', () => ({
  useWorkspaceTerminalActions: () => ({}),
}));
vi.mock('@/hooks/use-workspace-warmup', () => ({ useWorkspaceWarmup: () => ({}) }));
vi.mock('@/hooks/use-desktop-title-sync', () => ({ useDesktopTitleSync: () => undefined }));
vi.mock('@/components/clio/app-shell', () => ({
  ClioAppShell: ({
    children,
    contextBar,
    statusStrip,
  }: {
    children: ReactNode;
    contextBar: ReactNode;
    statusStrip: ReactNode;
  }) => (
    <>
      <header>{contextBar}</header>
      {children}
      <footer>{statusStrip}</footer>
    </>
  ),
}));
vi.mock('@/components/clio/conversation-welcome', () => ({
  ClioConversationWelcome: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/clio/navigation', () => ({ ClioNavigation: () => null }));
vi.mock('@/components/clio/workbench', () => ({ ClioWorkbench: () => null }));
vi.mock('@/components/clio/workspace-route-surfaces', () => ({
  WorkspaceActionAlerts: () => null,
  WorkspaceUnavailable: () => null,
  WorkspaceStatusStrip: ({ tokens, stream }: { tokens: number; stream: string }) => (
    <span>
      {stream} · Tokens: {tokens}
    </span>
  ),
}));
vi.mock('@/components/clio/composer', () => ({
  ClioComposer: ({ onOpenReference }: ClioComposerProps) => (
    <button
      onClick={() =>
        onOpenReference?.({
          kind: 'workspace_file',
          id: 'notes.md',
          label: 'notes.md',
          detail: 'Project notes',
          revision: '1',
          media_type: 'text/markdown',
          navigation: { path: 'notes.md' },
        })
      }
    >
      Open notes reference
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('new conversation reference navigation', () => {
  it('keeps the header menu and bottom status available before sending', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NewConversationPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('live · Tokens: 0')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'New conversation actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Workspace files' }));
    expect(mocks.revealWorkbench).toHaveBeenCalledWith({ kind: 'resources', section: 'files' });
  });

  it('opens desktop Downloads from a new conversation', async () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    try {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <NewConversationPage />
        </QueryClientProvider>,
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Open downloads' }));
      expect(mocks.downloads).toHaveBeenCalledOnce();
    } finally {
      Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    }
  });

  it('opens a selected file before a session has been created', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NewConversationPage />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Open notes reference' }));
    await waitFor(() => expect(mocks.openFile).toHaveBeenCalledWith('notes.md'));
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
