import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  workspaces: vi.fn(),
  allSessions: vi.fn(),
  workspaceFiles: vi.fn(),
  searchMemory: vi.fn(),
  agents: vi.fn(),
  infrastructureTargets: vi.fn(),
  switchConnection: vi.fn(),
  setTheme: vi.fn(),
  credentialsReady: true,
}));

const artifact = {
  id: 'artifact_1',
  session_id: 'sess_current',
  workspace_id: 'ws_current',
  name: 'station-evidence.csv',
  media_type: 'text/csv',
  uri: 'artifact://artifact_1',
};

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://127.0.0.1:8787' },
    credentialsReady: repository.credentialsReady,
  }),
}));
vi.mock('@/store/live-store', () => ({
  useLiveStore: (selector: (state: unknown) => unknown) =>
    selector({ entities: { artifacts: { [artifact.id]: artifact } } }),
}));
vi.mock('@/tauri/menu-actions', () => ({ useMenuAction: () => undefined }));
vi.mock('@/hooks/use-known-connections', () => ({
  useKnownConnections: () => [
    {
      endpoint: 'http://remote',
      label: 'Homelab',
      location: 'Remote computer',
      availability: { label: 'Ready' },
    },
  ],
}));
vi.mock('@/hooks/use-switch-connection', () => ({
  useSwitchConnection: () => repository.switchConnection,
}));
vi.mock('@/providers/appearance-provider', () => ({
  useTheme: () => ({ theme: 'light', setTheme: repository.setTheme }),
}));

import { ClioCommandMenu } from './command-menu';

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>
      <output data-testid="location-state">{JSON.stringify(location.state)}</output>
    </>
  );
}

function renderMenu(
  onOpenResource = vi.fn(),
  entry = '/workspaces/ws_current/sessions/sess_current',
  canvas = true,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            element={
              <>
                <ClioCommandMenu onOpenResource={onOpenResource} />
                <LocationProbe />
              </>
            }
            path="/workspaces/:workspaceId/sessions/:sessionId"
          />
          <Route
            element={
              <>
                <ClioCommandMenu onOpenResource={canvas ? onOpenResource : undefined} />
                <LocationProbe />
              </>
            }
            path="*"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onOpenResource;
}

beforeEach(() => {
  repository.credentialsReady = true;
  repository.agents.mockResolvedValue([
    {
      ref: 'lab/reviewer',
      id: 'reviewer',
      name: 'Station Reviewer',
      description: 'Review station measurements.',
      role: 'a science reviewer',
      kind: 'agent',
      plugins: [],
    },
  ]);
  repository.infrastructureTargets.mockResolvedValue([{ id: 'delta', label: 'Delta GPU host' }]);
  repository.switchConnection.mockResolvedValue(undefined);
  repository.workspaces.mockResolvedValue([
    {
      id: 'ws_current',
      name: 'science',
      display_name: 'Science campaign',
      path: 'D:/science',
      connection_id: 'local',
      pinned: false,
    },
    {
      id: 'ws_archive',
      name: 'archive',
      display_name: 'Evidence archive',
      path: 'D:/archive',
      connection_id: 'local',
      pinned: false,
    },
  ]);
  repository.allSessions.mockResolvedValue([
    {
      id: 'sess_current',
      workspace_id: 'ws_current',
      title: 'Current review',
      updated_at: new Date().toISOString(),
    },
    {
      id: 'sess_archive',
      workspace_id: 'ws_archive',
      title: 'Immutable evidence review',
      updated_at: new Date().toISOString(),
    },
  ]);
  repository.workspaceFiles.mockResolvedValue({
    entries: [{ path: 'results/stations.csv', type: 'file', internal: false, size: 1200 }],
    truncated: false,
  });
  repository.searchMemory.mockResolvedValue({
    query: 'immutable',
    include_cross_session: true,
    searched_sessions: ['sess_archive'],
    hits: [
      {
        session_id: 'sess_archive',
        session_title: 'Immutable evidence review',
        workspace_id: 'ws_archive',
        message_id: 'msg_9',
        role: 'assistant',
        created_at: '2026-08-23T12:00:00Z',
        text: 'The result is anchored to immutable evidence.',
        score: 2.1,
        match_terms: ['immutable'],
        metadata: {},
      },
    ],
    metadata: { source: 'arc' },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ClioCommandMenu workspace search', () => {
  it('searches and applies a theme without a workspace or navigating away', async () => {
    repository.credentialsReady = false;
    const user = userEvent.setup();
    renderMenu(vi.fn(), '/settings/general');
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('dark mode');
    await user.click(await screen.findByRole('option', { name: 'Switch to dark mode' }));
    expect(repository.setTheme).toHaveBeenCalledWith('dark');
    expect(screen.getByTestId('location')).toHaveTextContent('/settings/general');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('opens before backend startup completes, then searches without losing the draft', async () => {
    localStorage.clear();
    repository.credentialsReady = false;
    const user = userEvent.setup();
    renderMenu(vi.fn(), '/');
    await user.keyboard('{Control>}k{/Control}');
    const input = screen.getByPlaceholderText('Search work, files, artifacts, or actions…');
    await waitFor(() => expect(input).toHaveFocus());
    await user.keyboard('revie');
    expect(screen.getByText('Waiting for the default backend…')).toBeVisible();
    expect(repository.workspaces).not.toHaveBeenCalled();
    expect(repository.allSessions).not.toHaveBeenCalled();
    expect(repository.agents).not.toHaveBeenCalled();
    expect(repository.infrastructureTargets).not.toHaveBeenCalled();
    repository.credentialsReady = true;
    await user.keyboard('wer');
    expect(await screen.findByRole('option', { name: /Station Reviewer/u })).toBeVisible();
    expect(input).toHaveValue('reviewer');
    expect(repository.switchConnection).not.toHaveBeenCalled();
  });

  it.each([
    ['drive', 'Data sources', '/settings/data-sources'],
    ['reviewer', /Station Reviewer/u, '/settings/agents#agent-lab%2Freviewer'],
    ['delta', /Delta GPU host/u, '/infrastructure/services?target=delta'],
  ])(
    'opens a global result for %s while retaining workspace return context',
    async (query, name, route) => {
      const user = userEvent.setup();
      renderMenu();
      await user.keyboard('{Control>}k{/Control}');
      await user.keyboard(query);
      await user.click(await screen.findByRole('option', { name }));
      expect(screen.getByTestId('location')).toHaveTextContent(route);
      expect(screen.getByTestId('location-state')).toHaveTextContent(
        '"from":"/workspaces/ws_current/sessions/sess_current"',
      );
      expect(screen.getByTestId('location-state')).toHaveTextContent(
        '"endpoint":"http://127.0.0.1:8787"',
      );
    },
  );

  it('finds saved connections by name and switches through the shared connection flow', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('homelab');
    await user.click(await screen.findByRole('option', { name: /Homelab/u }));
    await waitFor(() =>
      expect(repository.switchConnection).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'http://remote', label: 'Homelab' }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('routes a file found from Settings back into a scoped workspace canvas', async () => {
    localStorage.setItem(
      'clio.last-workspace-route:http%3A%2F%2F127.0.0.1%3A8787',
      '/workspaces/ws_current/sessions/sess_current',
    );
    const user = userEvent.setup();
    renderMenu(vi.fn(), '/settings/general', false);
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('stations');
    await user.click(await screen.findByRole('option', { name: /results\/stations.csv/u }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/workspaces/ws_current/sessions/sess_current',
    );
    expect(screen.getByTestId('location-state')).toHaveTextContent(
      '"kind":"workspace-file","path":"results/stations.csv"',
    );
  });
  it.each([true, false])(
    'opens a file in the current new-conversation canvas (existing session=%s)',
    async (hasSession) => {
      const route = '/workspaces/ws_current/new';
      localStorage.removeItem('clio.last-workspace-route:http%3A%2F%2F127.0.0.1%3A8787');
      if (!hasSession) repository.allSessions.mockResolvedValue([]);
      const user = userEvent.setup();
      renderMenu(vi.fn(), route, false);
      await user.keyboard('{Control>}k{/Control}');
      await user.keyboard('stations');
      await user.click(await screen.findByRole('option', { name: /results\/stations.csv/u }));
      expect(repository.workspaceFiles).toHaveBeenCalledWith(
        'ws_current',
        expect.any(AbortSignal),
        { excludeServiceStorage: true },
      );
      expect(screen.getByTestId('location')).toHaveTextContent(route);
      expect(screen.getByTestId('location-state')).toHaveTextContent(
        '"kind":"workspace-file","path":"results/stations.csv"',
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );

  it('keeps global search open with its draft when a connection cannot be reached', async () => {
    repository.switchConnection.mockRejectedValue(new Error('Transport unavailable'));
    const user = userEvent.setup();
    renderMenu();
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('homelab');
    await user.click(await screen.findByRole('option', { name: /Homelab/u }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Transport unavailable');
    expect(screen.getByPlaceholderText('Search work, files, artifacts, or actions…')).toHaveValue(
      'homelab',
    );
    expect(screen.getByRole('dialog')).toBeVisible();
  });
  it('focuses the search immediately on each open and keeps the assistant shortcut inside its input', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.keyboard('{Control>}k{/Control}');
    const input = screen.getByPlaceholderText('Search work, files, artifacts, or actions…');
    await waitFor(() => expect(input).toHaveFocus());
    const shortcut = screen.getByRole('button', { name: /^Ask .+ Search Tab$/u });
    expect(shortcut.closest('[data-slot="input-group"]')).toContainElement(input);
    await user.keyboard('station');
    expect(input).toHaveValue('station');
    await user.keyboard('{Escape}');
    await user.keyboard('{Control>}k{/Control}');
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText('Search work, files, artifacts, or actions…'),
      ).toHaveFocus(),
    );
  });
  it('opens matching files and artifacts in the shared canvas', async () => {
    const user = userEvent.setup();
    const onOpenResource = renderMenu();

    await user.keyboard('{Control>}k{/Control}');
    const input = screen.getByPlaceholderText('Search work, files, artifacts, or actions…');
    await user.type(input, 'stations');
    expect(
      screen.queryByText('.clio\\agent\\documents\\working-copies\\copy_1\\stations.csv'),
    ).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: /results\/stations.csv/u }));
    expect(onOpenResource).toHaveBeenCalledWith({
      kind: 'workspace-file',
      path: 'results/stations.csv',
    });

    await user.keyboard('{Control>}k{/Control}');
    await user.type(
      screen.getByPlaceholderText('Search work, files, artifacts, or actions…'),
      'evidence.csv',
    );
    await user.click(await screen.findByRole('option', { name: /station-evidence.csv/u }));
    expect(onOpenResource).toHaveBeenCalledWith({ kind: 'artifact', artifact });
  });

  it('uses authoritative memory search and navigates to the exact message', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.keyboard('{Control>}k{/Control}');
    await user.type(
      screen.getByPlaceholderText('Search work, files, artifacts, or actions…'),
      'immutable',
    );
    const passage = await screen.findByRole('option', {
      name: /The result is anchored to immutable evidence/u,
    });
    expect(passage.querySelector('mark')).toHaveTextContent(/immutable/i);
    const headings = [...document.querySelectorAll('[cmdk-group-heading]')].map(
      (item) => item.textContent,
    );
    expect(headings.indexOf('Sessions')).toBeLessThan(headings.indexOf('Matching messages'));
    await user.click(passage);

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/workspaces/ws_archive/sessions/sess_archive#message-msg_9?find=immutable',
      ),
    );
    expect(repository.searchMemory).toHaveBeenCalledWith(
      'immutable',
      { includeCrossSession: true, limit: 12 },
      expect.any(AbortSignal),
    );
  });

  it('excludes only .clio service storage, not every dotfile, from the `@`-picker', async () => {
    // Second review round: includeHidden: false hides EVERY dotfile/dot-directory
    // (.gitignore, .github/workflows/ci.yml included), which would make ordinary
    // project files un-@-mentionable. The `@`-picker instead requests
    // excludeServiceStorage: true, which excludes only CLIO's own .clio/.clio-*
    // service storage, independent of the Files-view-only dot-files toggle.
    renderMenu();
    await userEvent.setup().keyboard('{Control>}k{/Control}');

    await waitFor(() =>
      expect(repository.workspaceFiles).toHaveBeenCalledWith(
        'ws_current',
        expect.any(AbortSignal),
        { excludeServiceStorage: true },
      ),
    );
  });
});
