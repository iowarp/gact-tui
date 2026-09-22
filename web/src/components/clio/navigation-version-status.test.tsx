import { brand } from '@brand';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ capabilities: vi.fn() }));
const desktop = vi.hoisted(() => ({
  snapshot: { status: 'current' } as
    | { status: 'current' }
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
});
