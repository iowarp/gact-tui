import { brand } from '@brand';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ capabilities: vi.fn() }));
const desktop = vi.hoisted(() => ({
  snapshot: { status: 'current' } as
    | { status: 'unknown' | 'current' }
    | { status: 'checking' }
    | { status: 'error'; message: string }
    | {
        status: 'available';
        update: { currentVersion: string; version: string };
      },
  install: vi.fn(async () => undefined),
  check: vi.fn(async () => undefined),
  // Same manifest the updater plugin polls (latest-lite.json), read as a
  // plain version string -- defaults to the release BOTH products are
  // already at, so a test only needs to override it to exercise drift.
  fetchLatestClioVersion: vi.fn(
    async (_releaseUrl: string | null): Promise<string | undefined> => '0.9.4.3',
  ),
}));
const updateManagedClio = vi.hoisted(() => vi.fn(async () => undefined));
const restartClio = vi.hoisted(() => vi.fn(async () => undefined));
const getVersion = vi.hoisted(() => vi.fn(async () => '0.9.4+3'));

vi.mock('@tauri-apps/api/app', () => ({ getVersion }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    credentialsReady: true,
    isManagedConnection: true,
    settings: { endpoint: 'http://127.0.0.1:8123' },
  }),
}));
vi.mock('@/tauri/desktop-updater', () => ({
  getDesktopUpdateSnapshot: () => desktop.snapshot,
  subscribeDesktopUpdate: () => () => undefined,
  installDesktopUpdate: desktop.install,
  checkForDesktopUpdate: desktop.check,
  fetchLatestClioVersion: (releaseUrl: string | null) => desktop.fetchLatestClioVersion(releaseUrl),
}));
vi.mock('@/tauri/managed-backend', () => ({ restartClio, updateManagedClio }));
vi.mock('@/tauri/external-url', () => ({ openExternalUrl: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { SidebarProvider } from '@/components/ui/sidebar';
import { SystemVersionStatus } from './navigation-version-status';

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

function renderStatus() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SidebarProvider>
        <ul>
          <li>
            <SystemVersionStatus />
          </li>
        </ul>
      </SidebarProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  desktop.snapshot = { status: 'current' };
  desktop.install.mockClear();
  desktop.check.mockClear();
  desktop.fetchLatestClioVersion.mockClear();
  desktop.fetchLatestClioVersion.mockResolvedValue('0.9.4.3');
  updateManagedClio.mockClear();
  getVersion.mockResolvedValue('0.9.4+3');
  repository.capabilities.mockResolvedValue({
    service: { name: 'clio-agent-gact', version: '0.9.4.3' },
  });
});

afterEach(cleanup);

describe('SystemVersionStatus', () => {
  it('shows one compact version control and two branded software rows', async () => {
    renderStatus();

    const trigger = await screen.findByRole('button', {
      name: `${brand.productName} and ${brand.agentName} are up to date`,
    });
    expect(trigger).toHaveTextContent('v0.9.4.3');
    fireEvent.click(trigger);

    expect(desktop.check).toHaveBeenCalledOnce();
    expect(await screen.findByText('System Version')).toBeVisible();
    expect(await screen.findByText(brand.productName)).toBeVisible();
    expect(screen.getByText(brand.agentName)).toBeVisible();
    expect(screen.getAllByText('v0.9.4.3')).toHaveLength(3);
    expect(screen.queryByText(/protocol/iu)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Update options' })).not.toBeInTheDocument();
  });

  it('offers independent updates and a single combined path', async () => {
    desktop.snapshot = {
      status: 'available',
      update: { currentVersion: '0.9.4+2', version: '0.9.4+3' },
    };
    getVersion.mockResolvedValue('0.9.4+2');
    repository.capabilities.mockResolvedValue({
      service: { name: 'clio-agent-gact', version: '0.9.4.2' },
    });
    renderStatus();

    fireEvent.click(await screen.findByRole('button', { name: 'Software update available' }));
    expect(await screen.findByRole('button', { name: 'Update all' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Update all' }));
    await waitFor(() =>
      expect(updateManagedClio).toHaveBeenCalledWith('v0.9.4.3', { restartApp: false }),
    );
    expect(desktop.install).toHaveBeenCalledOnce();
  });

  it('renders a mid-check desktop status as "Checking…", never as current', async () => {
    desktop.snapshot = { status: 'checking' };
    renderStatus();

    const trigger = await screen.findByRole('button', { name: 'Checking versions' });
    fireEvent.click(trigger);

    const desktopRow = within(await screen.findByTestId('version-row-desktop'));
    expect(await desktopRow.findByText('Checking…')).toBeVisible();
    expect(desktopRow.queryByText('Up to date')).not.toBeInTheDocument();
  });

  it('renders an un-checked desktop status as "Not checked", never as current', async () => {
    desktop.snapshot = { status: 'unknown' };
    renderStatus();

    const trigger = await screen.findByRole('button', { name: 'Version status not yet checked' });
    fireEvent.click(trigger);

    const desktopRow = within(await screen.findByTestId('version-row-desktop'));
    expect(await desktopRow.findByText('Not checked')).toBeVisible();
    expect(desktopRow.queryByText('Up to date')).not.toBeInTheDocument();
  });

  it('renders a failed check as needing attention, never as current', async () => {
    desktop.snapshot = { status: 'error', message: 'The update service did not respond.' };
    renderStatus();

    const trigger = await screen.findByRole('button', { name: 'Version status needs attention' });
    fireEvent.click(trigger);

    const desktopRow = within(await screen.findByTestId('version-row-desktop'));
    expect(await desktopRow.findByText('Needs attention')).toBeVisible();
    expect(desktopRow.queryByText('Up to date')).not.toBeInTheDocument();
  });

  it('reports the CLIO row as not checked when the release manifest is unavailable', async () => {
    desktop.fetchLatestClioVersion.mockResolvedValue(undefined);
    renderStatus();

    const trigger = await screen.findByRole('button', { name: 'Version status not yet checked' });
    fireEvent.click(trigger);

    const agentRow = within(await screen.findByTestId('version-row-agent'));
    expect(await agentRow.findByText('Not checked')).toBeVisible();
    expect(agentRow.queryByText('Up to date')).not.toBeInTheDocument();
    // The desktop row itself has a real, current check -- untouched by the
    // agent row's missing release feed.
    expect(
      within(screen.getByTestId('version-row-desktop')).getByText('Up to date'),
    ).toBeVisible();
  });
});
