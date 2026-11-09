import { clearDesktopHost, mockDesktopHost } from '@/test/desktop-host';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';
import type { ClioComposerProps } from '@/components/clio/composer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewConversationPage } from './new-conversation-page';
import { connectionScope } from '@/lib/connection-scope';

const mocks = vi.hoisted(() => ({
  openFile: vi.fn(),
  revealWorkbench: vi.fn(),
  downloads: vi.fn().mockResolvedValue(undefined),
  error: vi.fn(),
  locationState: null as unknown,
  navigate: vi.fn(),
  agents: [] as Array<Record<string, unknown>>,
  defaultAgentRef: 'clio/standard' as string | undefined,
}));
vi.mock('@/tauri/downloads', () => ({ openDownloads: mocks.downloads }));
vi.mock('@/hooks/use-connection-indicator-state', () => ({
  useConnectionIndicatorState: () => 'live',
}));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ workspaceId: 'workspace_demo' }),
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: '/workspaces/workspace_demo/new', state: mocks.locationState }),
}));
vi.mock('@/components/clio/connected-source-picker', () => ({
  ConnectedSourcePicker: ({
    workspaceId,
    initialProviderId,
    initialObsidianChoice,
    onOpenChange,
  }: {
    workspaceId: string;
    initialProviderId?: string;
    initialObsidianChoice?: string;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div role="dialog" aria-label="Source connection">
      <span>
        {workspaceId}:{initialProviderId}:{initialObsidianChoice}
      </span>
      <button onClick={() => onOpenChange(false)}>Close source setup</button>
    </div>
  ),
}));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), error: mocks.error } }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({
    capabilities: async () => ({ capabilities: { x_clio_agent_plugins: true } }),
    sessionDefaults: async () => ({
      provider_id: 'codex',
      model_id: 'gpt-6-luna',
      default_agent_ref: mocks.defaultAgentRef,
    }),
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
    workspaces: {
      data: [
        { id: 'workspace_demo', display_name: 'Demo', path: '/demo' },
        { id: 'workspace_lab', display_name: 'Lab notes', path: '/lab' },
      ],
    },
    capabilities: { data: { capabilities: {} } },
    allSessions: { data: [] },
    sessions: { data: [] },
    attentionInteractions: [],
    workspaceFiles: {},
    workspaceResources: { data: [] },
    installedAgents: { data: mocks.agents },
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
  useSessionDiffActions: () => ({ undo: {} }),
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
  mocks.locationState = null;
  mocks.agents = [];
  mocks.defaultAgentRef = 'clio/standard';
});

describe('new conversation reference navigation', () => {
  it('opens the Settings source intent in the chosen workspace and consumes it on close', async () => {
    mocks.locationState = {
      sourceConnection: {
        scope: connectionScope({ endpoint: 'http://clio.test' }),
        providerId: 'obsidian',
        choice: 'existing',
      },
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NewConversationPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('dialog', { name: 'Source connection' })).toHaveTextContent(
      'workspace_demo:obsidian:existing',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close source setup' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/workspaces/workspace_demo/new', {
      replace: true,
      state: null,
    });
  });
  it('does not replay a Settings source intent on a different service', async () => {
    mocks.locationState = {
      sourceConnection: {
        scope: connectionScope({ endpoint: 'http://other-clio.test' }),
        providerId: 'obsidian',
        choice: 'new',
      },
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NewConversationPage />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('dialog', { name: 'Source connection' })).not.toBeInTheDocument();
  });
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
    mockDesktopHost();
    try {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <TooltipProvider>
            <NewConversationPage />
          </TooltipProvider>
        </QueryClientProvider>,
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Open downloads' }));
      expect(mocks.downloads).toHaveBeenCalledOnce();
    } finally {
      clearDesktopHost();
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

function renderDraft() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NewConversationPage />
    </QueryClientProvider>,
  );
}

describe('new conversation draft screen', () => {
  it('names the workspace and the draft, greets once, and offers no starter prompts', async () => {
    renderDraft();
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByText('Demo')).toBeVisible();
    expect(within(trail).getByText('New conversation')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Starter prompts' })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Open notes reference' })).toBeVisible();
  });

  it('moves the draft to another workspace from the workspace chip', async () => {
    renderDraft();
    await userEvent.click(screen.getByRole('button', { name: 'Conversation workspace: Demo' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitemradio', { name: 'Demo' })).toBeChecked();
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'Lab notes' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/workspaces/workspace_lab/new', {
      replace: true,
    });
  });
});

describe('new conversation agent choice', () => {
  it('groups installed agents apart from your agents and marks the default once', async () => {
    mocks.agents = [
      { ref: 'clio/standard', id: 'standard', name: 'CLIO', kind: 'agent', description: 'General' },
      { ref: 'clio/science', id: 'science', name: 'Scientist', kind: 'agent', description: '' },
      { ref: 'user/mine', id: 'mine', name: 'My analyst', kind: 'user', description: 'Mine' },
    ];
    renderDraft();
    const chip = await screen.findByRole('button', { name: 'Conversation agent: CLIO' });
    await userEvent.click(chip);
    const menu = await screen.findByRole('menu');
    const installed = within(menu).getByRole('group', { name: 'Installed agents' });
    const own = within(menu).getByRole('group', { name: 'Your agents' });
    expect(
      within(installed)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['CLIOGeneralDefault', 'Scientist']);
    expect(within(installed).getByRole('menuitemradio', { name: /^CLIO/u })).toBeChecked();
    expect(within(own).getByRole('menuitemradio', { name: /^My analyst/u })).not.toBeChecked();
    expect(within(menu).getAllByText('Default')).toHaveLength(1);
    await userEvent.click(within(installed).getByRole('menuitemradio', { name: 'Scientist' }));
    expect(
      await screen.findByRole('button', { name: 'Conversation agent: Scientist' }),
    ).toBeVisible();
  });

  it('opens the Agent tab from Customize and from Manage agents', async () => {
    mocks.agents = [
      { ref: 'clio/standard', id: 'standard', name: 'CLIO', kind: 'agent', description: '' },
    ];
    renderDraft();
    await userEvent.click(await screen.findByRole('button', { name: 'Customize the agent' }));
    expect(mocks.revealWorkbench).toHaveBeenCalledWith({ kind: 'resources', section: 'agent' });
    mocks.revealWorkbench.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Conversation agent: CLIO' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Manage agents…' }));
    expect(mocks.revealWorkbench).toHaveBeenCalledWith({ kind: 'resources', section: 'agent' });
  });

  it('offers Customize while the service reports no default agent', async () => {
    mocks.defaultAgentRef = undefined;
    renderDraft();
    await userEvent.click(await screen.findByRole('button', { name: 'Customize the agent' }));
    expect(mocks.revealWorkbench).toHaveBeenCalledWith({ kind: 'resources', section: 'agent' });
  });
});
