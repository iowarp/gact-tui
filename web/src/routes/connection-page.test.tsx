import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  repository: {
    allSessions: vi.fn(),
    capabilities: vi.fn(),
    workspaces: vi.fn(),
  },
  resolveConnection: vi.fn(),
}));

vi.mock('@/lib/connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/connection')>();
  return { ...actual, createRepository: () => mocks.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://127.0.0.1:8788', label: 'Contained' },
    recents: [],
    credentialsReady: true,
    managedConnectionReady: false,
    credentialError: undefined,
    resolveConnection: mocks.resolveConnection,
    connect: mocks.connect,
    forget: vi.fn(),
  }),
}));

import { ConnectionPage } from './connection-page';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.resolveConnection.mockResolvedValue({
    endpoint: 'http://127.0.0.1:8788',
    label: 'Contained',
  });
  mocks.repository.capabilities.mockResolvedValue({ gact_versions: ['0.3'] });
  mocks.repository.workspaces.mockResolvedValue([{ id: 'ws_default', name: 'default' }]);
  mocks.repository.allSessions.mockResolvedValue([
    {
      id: 'sess_empty',
      workspace_id: 'ws_default',
      title: 'New conversation',
      archived: false,
      parent_session_id: '',
      last_interaction_at: '',
      updated_at: '2026-09-02T12:00:00Z',
    },
  ]);
});

afterEach(cleanup);

it('opens an existing workspace session after a successful connection', async () => {
  const user = userEvent.setup();
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/?intent=connect']}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
          <Route
            element={<div>Connected workspace session</div>}
            path="/workspaces/:workspaceId/sessions/:sessionId"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await user.click(screen.getByRole('button', { name: 'Open workspace' }));

  expect(await screen.findByText('Connected workspace session')).toBeVisible();
  expect(mocks.connect).toHaveBeenCalledOnce();
});
