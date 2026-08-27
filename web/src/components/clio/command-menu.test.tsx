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
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));
vi.mock('@/store/live-store', () => ({
  useLiveStore: (selector: (state: unknown) => unknown) =>
    selector({ entities: { artifacts: { [artifact.id]: artifact } } }),
}));
vi.mock('@/tauri/menu-actions', () => ({ useMenuAction: () => undefined }));

import { ClioCommandMenu } from './command-menu';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.hash}`}</output>;
}

function renderMenu(onOpenResource = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/workspaces/ws_current/sessions/sess_current']}>
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
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onOpenResource;
}

beforeEach(() => {
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
  repository.workspaceFiles.mockResolvedValue([
    { path: 'results/stations.csv', type: 'file', internal: false, size: 1200 },
  ]);
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
  it('opens matching files and artifacts in the shared canvas', async () => {
    const user = userEvent.setup();
    const onOpenResource = renderMenu();

    await user.keyboard('{Control>}k{/Control}');
    const input = screen.getByPlaceholderText('Search work, files, artifacts, or actions…');
    await user.type(input, 'stations');
    expect(
      screen.queryByText('.clio\\agent\\documents\\working-copies\\copy_1\\stations.csv'),
    ).not.toBeInTheDocument();
    await user.click(await screen.findByText('results/stations.csv'));
    expect(onOpenResource).toHaveBeenCalledWith({
      kind: 'workspace-file',
      path: 'results/stations.csv',
    });

    await user.keyboard('{Control>}k{/Control}');
    await user.type(
      screen.getByPlaceholderText('Search work, files, artifacts, or actions…'),
      'evidence.csv',
    );
    await user.click(await screen.findByText('station-evidence.csv'));
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
    await user.click(await screen.findByText('The result is anchored to immutable evidence.'));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/workspaces/ws_archive/sessions/sess_archive#message-msg_9',
      ),
    );
    expect(repository.searchMemory).toHaveBeenCalledWith(
      'immutable',
      { workspaceId: 'ws_current', includeCrossSession: true, limit: 12 },
      expect.any(AbortSignal),
    );
  });
});
