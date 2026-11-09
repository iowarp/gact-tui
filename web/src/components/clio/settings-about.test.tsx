import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  capabilities: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import { AboutSettings } from './settings-about';

function renderAbout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AboutSettings />
    </QueryClientProvider>,
  );
}

/** `AboutValue` renders a settings row -- read the value in the row's control column. */
function valueFor(label: string): string {
  const row = screen.getByText(label).closest('[data-slot="settings-row"]');
  return row?.querySelector('[data-slot="settings-control"]')?.textContent ?? '';
}

const baseCapabilities = {
  gact_versions: ['0.3'],
  a2ui_versions: ['0.9.1'],
  capabilities: {},
  degradations: [],
  model_catalog: { source: 'server', observed_at: '2026-09-18T00:00:00Z', stale: false },
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('About panel version rows', () => {
  it('reports build/runtime version rows as unreported, honestly, when the connected service predates versions', async () => {
    repository.capabilities.mockResolvedValue({
      ...baseCapabilities,
      service: { name: 'clio-agent', version: '0.9.4' },
    });

    renderAbout();

    expect(await screen.findByText('0.9.4')).toBeVisible();
    expect(valueFor('Backend build')).toBe('Unreported by this service');
    expect(valueFor('Python')).toBe('Unreported by this service');
    expect(valueFor('Marketplace registry')).toBe('Unreported by this service');
  });

  it('reports the marketplace row as not configured when versions are present but no source is pinned', async () => {
    repository.capabilities.mockResolvedValue({
      ...baseCapabilities,
      versions: {
        clio_agent: '0.9.4.1',
        backend_build: '0.9.4.1+3b3bdfbe',
        python: '3.12.6',
        gact_contract: '0.3',
        marketplace: null,
      },
    });

    renderAbout();

    expect(await screen.findByText('0.9.4.1+3b3bdfbe')).toBeVisible();
    expect(valueFor('Python')).toBe('3.12.6');
    expect(valueFor('Marketplace registry')).toBe('Not configured');
  });

  it('renders the marketplace source, ref, and a short installed commit when a source is pinned', async () => {
    repository.capabilities.mockResolvedValue({
      ...baseCapabilities,
      versions: {
        clio_agent: '0.9.4.1',
        backend_build: '0.9.4.1+3b3bdfbe',
        python: '3.12.6',
        gact_contract: '0.3',
        marketplace: {
          source: 'https://github.com/iowarp/clio-agent-marketplace.git',
          ref: 'main',
          pinned_commit: 'fac72f0670607a08871a369040acd867e642ebe',
          installed_commit: 'ea49ed17aa11cdef0000000000000000000000',
          source_id: 'src_1e51387cad00',
        },
      },
    });

    renderAbout();

    expect(await screen.findByText('0.9.4.1+3b3bdfbe')).toBeVisible();
    expect(valueFor('Marketplace registry')).toBe(
      'https://github.com/iowarp/clio-agent-marketplace.git, ref main, installed ea49ed17aa11',
    );
  });

  it('keeps protocol versions and the address behind Technical details', async () => {
    repository.capabilities.mockResolvedValue({
      ...baseCapabilities,
      service: { name: 'clio-agent', version: '0.9.4' },
    });

    renderAbout();

    expect(await screen.findByText('0.9.4')).toBeVisible();
    expect(screen.queryByText('Workspace protocol')).not.toBeInTheDocument();
    expect(screen.queryByText('127.0.0.1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Technical details/u })).toBeVisible();
  });

  it('shows a plain-language error with Retry instead of the raw request failure', async () => {
    repository.capabilities.mockRejectedValue(new Error('Request failed with 404 Not Found'));

    renderAbout();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Service details could not be loaded.');
    expect(screen.queryByText(/404/u)).not.toBeInTheDocument();
    expect(screen.queryByText('Backend build')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});
