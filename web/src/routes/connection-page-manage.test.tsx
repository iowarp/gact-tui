import { cleanup, screen, within } from '@testing-library/react';
import { renderWithTooltips as render } from '@/test/render-with-tooltips';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  forget: vi.fn(async () => undefined),
  rename: vi.fn(),
  managedLabel: undefined as string | undefined,
  inTauri: false,
  managedConnectionReady: false,
  managedConnection: undefined as { endpoint: string; token?: string } | undefined,
  recents: [] as Array<{ endpoint: string; label?: string }>,
  repository: {
    allSessions: vi.fn(async () => []),
    capabilities: vi.fn(async () => ({ gact_versions: ['0.3'] })),
    serviceHealth: vi.fn(async () => ({ healthy: true, overall_status: 'healthy' })),
    workspaces: vi.fn(async () => []),
    infrastructureTargets: vi.fn(async () => []),
    managedServiceCatalog: vi.fn(async () => ({ facts: {}, services: [] })),
  },
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => mocks.inTauri }));
vi.mock('@/lib/connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/connection')>();
  return { ...actual, createRepository: () => mocks.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://127.0.0.1:8788', label: 'Contained' },
    recents: mocks.recents,
    credentialsReady: true,
    managedConnectionReady: mocks.managedConnectionReady,
    managedConnection: mocks.managedConnection,
    managedBackendStatus: undefined,
    credentialError: undefined,
    resolveConnection: vi.fn(),
    connect: mocks.connect,
    forget: mocks.forget,
    rename: mocks.rename,
    managedLabel: mocks.managedLabel,
  }),
}));

import { ConnectionPage } from './connection-page';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.inTauri = false;
  mocks.managedConnectionReady = false;
  mocks.managedConnection = undefined;
  mocks.recents = [];
  mocks.managedLabel = undefined;
});

afterEach(cleanup);
function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/?intent=connect']}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('renames a known service, refusing a name another service already uses', async () => {
  mocks.recents = [
    { endpoint: 'http://ares.example:17800', label: 'ares lab' },
    { endpoint: 'http://laptop.example:17800', label: 'laptop' },
  ];
  const user = userEvent.setup();
  renderPage();

  await user.click(screen.getByRole('button', { name: 'Service actions for ares lab' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const input = await screen.findByLabelText('Name');
  await user.clear(input);
  await user.type(input, 'Laptop');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('A service named “Laptop” already exists.')).toBeVisible();
  expect(mocks.rename).not.toHaveBeenCalled();

  await user.clear(input);
  await user.type(input, 'ares GPU queue');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(mocks.rename).toHaveBeenCalledWith(
    expect.objectContaining({ endpoint: 'http://ares.example:17800' }),
    'ares GPU queue',
  );
  // Saving the name only renames: it never submits the connect form around it.
  expect(mocks.connect).not.toHaveBeenCalled();
  expect(mocks.repository.allSessions).not.toHaveBeenCalled();
});

it('forgets a known service only after confirming', async () => {
  mocks.recents = [
    { endpoint: 'http://ares.example:17800', label: 'ares lab' },
    { endpoint: 'http://laptop.example:17800', label: 'laptop' },
  ];
  const user = userEvent.setup();
  renderPage();

  await user.click(screen.getByRole('button', { name: 'Service actions for laptop' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Forget on this device' }));
  expect(mocks.forget).not.toHaveBeenCalled();
  const confirm = await screen.findByRole('alertdialog', { name: 'Forget laptop?' });
  await user.click(within(confirm).getByRole('button', { name: 'Forget' }));
  expect(mocks.forget).toHaveBeenCalledWith('http://laptop.example:17800');
});

it('forgetting the selected service selects the next one', async () => {
  mocks.recents = [
    { endpoint: 'http://ares.example:17800', label: 'ares lab' },
    { endpoint: 'http://laptop.example:17800', label: 'laptop' },
  ];
  const user = userEvent.setup();
  renderPage();
  expect(screen.getByRole('button', { name: /ares lab/u, pressed: true })).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Service actions for ares lab' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Forget on this device' }));
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Forget' }),
  );

  expect(mocks.forget).toHaveBeenCalledWith('http://ares.example:17800');
  expect(screen.getByRole('button', { name: /laptop/u, pressed: true })).toBeVisible();
});

it('lets This computer be renamed but never forgotten', async () => {
  mocks.inTauri = true;
  mocks.managedConnectionReady = true;
  mocks.managedConnection = { endpoint: 'http://127.0.0.1:53211', token: 'supervisor-token' };
  const user = userEvent.setup();
  renderPage();

  await user.click(screen.getByRole('button', { name: 'Service actions for This computer' }));
  expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeVisible();
  expect(screen.queryByRole('menuitem', { name: /Forget/u })).not.toBeInTheDocument();
});

it('shows the name the user gave the local service', () => {
  mocks.inTauri = true;
  mocks.managedConnectionReady = true;
  mocks.managedConnection = { endpoint: 'http://127.0.0.1:53211', token: 'supervisor-token' };
  mocks.managedLabel = 'laptop';
  renderPage();

  expect(screen.getByText('laptop')).toBeVisible();
  expect(screen.queryByText('This computer')).not.toBeInTheDocument();
});
