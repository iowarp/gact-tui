import { vocab } from '@/lib/brand-vocabulary';
import { brand } from '@brand';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ capabilities: vi.fn(), latestRelease: vi.fn() }));
const desktop = vi.hoisted(() => ({
  snapshot: { status: 'current' } as
    | { status: 'unknown' | 'current' }
    | { status: 'checking' }
    | {
        status: 'error';
        message: string;
        reason:
          | 'manifest_not_published'
          | 'platform_not_published'
          | 'signature_mismatch'
          | 'unreachable';
      }
    | {
        status: 'available';
        update: { currentVersion: string; version: string };
      },
  install: vi.fn(async () => undefined),
  check: vi.fn(async () => undefined),
}));
const updateManagedClio = vi.hoisted(() => vi.fn(async () => undefined));
const restartClio = vi.hoisted(() => vi.fn(async () => undefined));
const getVersion = vi.hoisted(() => vi.fn(async () => '0.9.4+3'));
const runtime = vi.hoisted(() => ({ desktopShell: true }));
const latestPublishedRelease = vi.hoisted(() => vi.fn());
vi.mock('@/lib/github-releases', () => ({ latestPublishedRelease }));

vi.mock('@tauri-apps/api/app', () => ({ getVersion }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => runtime.desktopShell }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/tauri/clio-update-verification', () => ({
  managedClioVersion: async () => (await repository.capabilities()).service?.version,
}));
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
}));
vi.mock('@/tauri/managed-backend', () => ({ restartClio, updateManagedClio }));
vi.mock('@/tauri/external-url', () => ({ openExternalUrl: vi.fn() }));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), error: vi.fn() } }));

import { SidebarProvider } from '@/components/ui/sidebar';
import { useUpdateFlowStore } from '@/store/update-flow-store';
import { SystemVersionStatus } from './navigation-version-status';
import { setUpdateChannel } from '@/lib/update-channel';

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
  useUpdateFlowStore.getState().reset();
  localStorage.clear();
  setUpdateChannel('stable');
  latestPublishedRelease.mockReset();
  latestPublishedRelease.mockResolvedValue({ tag_name: 'v0.9.5-beta.2' });
  runtime.desktopShell = true;
  desktop.snapshot = { status: 'current' };
  desktop.install.mockClear();
  desktop.check.mockClear();
  updateManagedClio.mockClear();
  getVersion.mockClear();
  getVersion.mockResolvedValue('0.9.4+3');
  repository.capabilities.mockResolvedValue({
    service: { name: 'clio-agent-gact', version: '0.9.4.3' },
  });
  // Same manifest the desktop updater plugin polls (latest-lite.json), now
  // read server-side (GET /v1/system/latest-release) -- defaults to the
  // release BOTH products are already at, so a test only needs to override
  // it to exercise drift.
  repository.latestRelease.mockClear();
  repository.latestRelease.mockResolvedValue({
    version: '0.9.4.3',
    source: 'https://github.com/iowarp/clio-agent/releases/latest/download/latest-lite.json',
    checked_at: '2026-09-24T00:00:00Z',
    degradation: null,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('SystemVersionStatus', () => {
  it('uses one signed release target in beta, without an independent agent update', async () => {
    setUpdateChannel('beta');
    desktop.snapshot = {
      status: 'available',
      update: { currentVersion: '0.9.4.3', version: '0.9.5-beta.2' },
    };
    renderStatus();
    fireEvent.click(await screen.findByRole('button', { name: 'Software update available' }));
    fireEvent.click(await screen.findByRole('button', { name: `Update ${vocab.agent}` }));
    await waitFor(() => expect(desktop.install).toHaveBeenCalledOnce());
    expect(updateManagedClio).not.toHaveBeenCalled();
    expect(latestPublishedRelease).not.toHaveBeenCalled();
  });

  it('keeps an explicit stable opt-out when the installed agent is beta', async () => {
    repository.capabilities.mockResolvedValue({ service: { version: '0.9.5b1' } });
    renderStatus();
    fireEvent.click(await screen.findByRole('button', { name: /up to date|available/ }));
    await waitFor(() => expect(desktop.check).toHaveBeenCalled());
    expect(latestPublishedRelease).not.toHaveBeenCalled();
  });

  it('shows one compact control and read-only component version rows', async () => {
    renderStatus();
    fireEvent.click(await screen.findByRole('button', { name: /are up to date/ }));
    expect(await screen.findByTestId('version-row-agent')).toBeVisible();
    expect(screen.getByTestId('version-row-desktop')).toBeVisible();
    expect(
      within(screen.getByTestId('version-row-agent')).queryByRole('button'),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('version-row-desktop')).queryByRole('button'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Check for updates' })).toHaveLength(1);
    expect(screen.getByRole('status', { name: 'Update status' })).toHaveTextContent(
      `${vocab.agent} is up to date`,
    );
  });

  it('never picks a newer backend feed instead of the signed app release', async () => {
    repository.latestRelease.mockResolvedValue({ version: '99.0.0' });
    desktop.snapshot = {
      status: 'available',
      update: { currentVersion: '0.9.4.3', version: '0.9.4.4' },
    };
    renderStatus();
    fireEvent.click(await screen.findByRole('button', { name: 'Software update available' }));
    fireEvent.click(screen.getByRole('button', { name: `Update ${vocab.agent}` }));
    await waitFor(() => expect(desktop.install).toHaveBeenCalledOnce());
    expect(repository.latestRelease).not.toHaveBeenCalled();
    expect(updateManagedClio).not.toHaveBeenCalled();
    expect(
      within(screen.getByTestId('version-row-agent')).queryByRole('button'),
    ).not.toBeInTheDocument();
  });

  it('locks the single action throughout an update', async () => {
    useUpdateFlowStore.getState().start('both', '0.9.4.4');
    desktop.snapshot = {
      status: 'available',
      update: { currentVersion: '0.9.4.3', version: '0.9.4.4' },
    };
    renderStatus();
    fireEvent.click(await screen.findByRole('button', { name: 'Software update available' }));
    expect(await screen.findByRole('button', { name: 'Updating' })).toBeDisabled();
    expect(
      within(screen.getByTestId('version-row-agent')).queryByRole('button'),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('version-row-desktop')).queryByRole('button'),
    ).not.toBeInTheDocument();
  });

  it('retains an incomplete-update failure instead of reporting success', async () => {
    desktop.snapshot = {
      status: 'available',
      update: { currentVersion: '0.9.4.3', version: '0.9.4.4' },
    };
    desktop.install.mockRejectedValueOnce(new Error('The signature verification failed.'));
    renderStatus();
    fireEvent.click(await screen.findByRole('button', { name: 'Software update available' }));
    fireEvent.click(screen.getByRole('button', { name: `Update ${vocab.agent}` }));
    await waitFor(() => expect(useUpdateFlowStore.getState().step).toBe('failed'));
    expect(useUpdateFlowStore.getState().reason).toBe('The signature verification failed.');
  });

  it('renders a mid-check desktop status as "Checking…", never as current', async () => {
    desktop.snapshot = { status: 'checking' };
    renderStatus();

    const trigger = await screen.findByRole('button', { name: 'Checking versions' });
    fireEvent.click(trigger);

    const desktopRow = within(await screen.findByTestId('version-row-desktop'));
    expect(screen.getByRole('status', { name: 'Update status' })).toHaveTextContent(
      'Checking for updates',
    );
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
    expect(desktopRow.queryByText('Up to date')).not.toBeInTheDocument();
  });

  it('renders an un-checked desktop status as "Not checked", never as current', async () => {
    desktop.snapshot = { status: 'unknown' };
    renderStatus();

    const trigger = await screen.findByRole('button', { name: 'Version status not yet checked' });
    fireEvent.click(trigger);

    const desktopRow = within(await screen.findByTestId('version-row-desktop'));
    expect(screen.getByRole('status', { name: 'Update status' })).toHaveTextContent(
      'Updates not checked',
    );
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
    expect(desktopRow.queryByText('Up to date')).not.toBeInTheDocument();
  });

  it('renders a rejected update signature as needing attention, with its reason', async () => {
    desktop.snapshot = {
      status: 'error',
      message: 'Update rejected: signature mismatch',
      reason: 'signature_mismatch',
    };
    renderStatus();

    const trigger = await screen.findByRole('button', { name: 'Version status needs attention' });
    fireEvent.click(trigger);

    const desktopRow = within(await screen.findByTestId('version-row-desktop'));
    expect(screen.getByRole('status', { name: 'Update status' })).toHaveTextContent(
      'Update needs attention',
    );
    expect(screen.getByText('The update was rejected: its signature did not match.')).toBeVisible();
    expect(desktopRow.queryByText('Up to date')).not.toBeInTheDocument();
  });

  it('says a desktop release still being published is why it could not check', async () => {
    desktop.snapshot = {
      status: 'error',
      message: 'No update manifest published yet',
      reason: 'manifest_not_published',
    };
    renderStatus();

    fireEvent.click(await screen.findByRole('button', { name: 'Could not check for updates' }));

    const desktopRow = within(await screen.findByTestId('version-row-desktop'));
    expect(screen.getByRole('status', { name: 'Update status' })).toHaveTextContent(
      'Could not check for updates',
    );
    expect(screen.getByText('The latest release is still being published.')).toBeVisible();
    expect(desktopRow.queryByText('Needs attention')).not.toBeInTheDocument();
  });

  it('says why the CLIO check could not complete instead of "Not checked"', async () => {
    runtime.desktopShell = false;
    vi.stubEnv('VITE_CLIO_WORKSPACE_VERSION', '0.9.4.3');
    repository.latestRelease.mockResolvedValue({
      version: null,
      source: 'https://github.com/iowarp/clio-agent/releases/latest/download/latest-lite.json',
      checked_at: '2026-09-24T00:00:00Z',
      degradation: {
        reason: 'manifest_not_published',
        message: 'The latest release is still being published.',
      },
    });
    renderStatus();

    fireEvent.click(await screen.findByRole('button', { name: 'Could not check for updates' }));

    const agentRow = within(await screen.findByTestId('version-row-agent'));
    expect(screen.getByRole('status', { name: 'Update status' })).toHaveTextContent(
      'Could not check for updates',
    );
    expect(screen.getByText('The latest release is still being published.')).toBeVisible();
    expect(agentRow.queryByText('Not checked')).not.toBeInTheDocument();
    expect(agentRow.queryByText('Up to date')).not.toBeInTheDocument();
    // The desktop row itself has a real, current check -- untouched by the
    // agent row's missing release feed.
    expect(
      within(screen.getByTestId('version-row-desktop')).getByText('Web interface'),
    ).toBeVisible();
  });

  it('says the release server could not be reached for any other failure', async () => {
    runtime.desktopShell = false;
    vi.stubEnv('VITE_CLIO_WORKSPACE_VERSION', '0.9.4.3');
    repository.latestRelease.mockResolvedValue({
      version: null,
      source: 'https://github.com/iowarp/clio-agent/releases/latest/download/latest-lite.json',
      checked_at: '2026-09-24T00:00:00Z',
      degradation: {
        reason: 'manifest_unreachable',
        message: 'release manifest returned HTTP 503',
      },
    });
    renderStatus();

    fireEvent.click(await screen.findByRole('button', { name: 'Could not check for updates' }));

    expect(await screen.findByText('The release server could not be reached.')).toBeVisible();
  });
});

describe('SystemVersionStatus in a plain browser', () => {
  beforeEach(() => {
    runtime.desktopShell = false;
    // In a plain browser the desktop updater never runs: its snapshot stays
    // at the initial 'unknown' forever.
    desktop.snapshot = { status: 'unknown' };
    vi.stubEnv('VITE_CLIO_WORKSPACE_VERSION', '0.11.2+patch.25');
    repository.capabilities.mockClear();
    repository.capabilities.mockResolvedValue({
      service: { name: 'clio-agent-gact', version: '0.11.2.25' },
    });
    repository.latestRelease.mockResolvedValue({
      version: '0.11.2.25',
      source: 'https://github.com/iowarp/clio-agent/releases/latest/download/latest-lite.json',
      checked_at: '2026-10-01T00:00:00Z',
      degradation: null,
    });
  });

  it('shows the web build version instead of waiting on the desktop shell', async () => {
    renderStatus();

    const trigger = await screen.findByRole('button', {
      name: `${brand.agentName} is up to date`,
    });
    expect(trigger).toHaveTextContent('v0.11.2.25');
    expect(trigger).not.toHaveTextContent('Version');
    expect(getVersion).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    // Opening the popover rechecks the agent only -- the desktop updater is
    // never asked to check from a browser.
    await waitFor(() => expect(repository.capabilities).toHaveBeenCalledTimes(2));
    expect(desktop.check).not.toHaveBeenCalled();

    const productRow = within(await screen.findByTestId('version-row-desktop'));
    expect(productRow.getByText('v0.11.2.25')).toBeVisible();
    expect(productRow.getByText('Web interface')).toBeVisible();
    expect(productRow.queryByText('Not checked')).not.toBeInTheDocument();
    expect(productRow.queryByText('Checking…')).not.toBeInTheDocument();
    expect(productRow.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Update status' })).toHaveTextContent(
      `${vocab.agent} is up to date`,
    );
  });

  it('settles on the agent state, never an endless check, when the agent has no version', async () => {
    repository.capabilities.mockResolvedValue({ service: { name: 'clio-agent-gact' } });
    renderStatus();

    const trigger = await screen.findByRole('button', { name: 'Version status not yet checked' });
    expect(trigger).toHaveTextContent('v0.11.2.25');
    expect(screen.queryByRole('button', { name: 'Checking versions' })).not.toBeInTheDocument();
  });

  it('does not invoke native installers from a plain browser', async () => {
    repository.capabilities.mockResolvedValue({ service: { version: '0.11.2.24' } });
    renderStatus();
    fireEvent.click(await screen.findByRole('button', { name: 'Software update available' }));
    fireEvent.click(await screen.findByRole('button', { name: `Update ${vocab.agent}` }));
    expect(await screen.findByRole('heading', { name: `Update ${vocab.agent}` })).toBeVisible();
    expect(
      screen.getByText(/runtime and browser interface come from the same release/),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: `Open ${vocab.agent} 0.11.2.25` })).toHaveAttribute(
      'href',
      expect.stringContaining('/tag/v0.11.2.25'),
    );
    expect(updateManagedClio).not.toHaveBeenCalled();
    expect(desktop.install).not.toHaveBeenCalled();
  });
});

describe('SystemVersionStatus in the desktop app', () => {
  it('keeps checking until the desktop shell reports its version', async () => {
    getVersion.mockReturnValue(new Promise<string>(() => undefined));
    renderStatus();

    const trigger = await screen.findByRole('button', { name: 'Checking versions' });
    expect(trigger).toHaveTextContent('Version');
    expect(getVersion).toHaveBeenCalledOnce();
  });
});
