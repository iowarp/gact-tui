import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnownConnection } from '@/hooks/use-known-connections';

const repository = vi.hoisted(() => ({ capabilities: vi.fn(), latestRelease: vi.fn() }));
const connection = vi.hoisted(() => ({
  settings: { endpoint: 'http://127.0.0.1:8100' },
  credentialsReady: true,
  forget: vi.fn(),
  rename: vi.fn(),
}));
const switchConnection = vi.hoisted(() => vi.fn());
const known = vi.hoisted(() => ({ list: [] as KnownConnection[] }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({ useConnectionSettings: () => connection }));
vi.mock('@/hooks/use-switch-connection', () => ({ useSwitchConnection: () => switchConnection }));
vi.mock('@/hooks/use-known-connections', () => ({ useKnownConnections: () => known.list }));
vi.mock('@/lib/update-channel', () => ({ useUpdateChannel: () => 'stable' }));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { TooltipProvider } from '@/components/ui/tooltip';
import { ConnectionsSettings } from './settings-connection';

const capabilities = {
  service: { name: 'clio', version: '0.9.5.1' },
  gact_versions: ['0.3'],
  a2ui_versions: [],
  capabilities: {},
  degradations: [],
  model_catalog: { source: 'server', observed_at: '2026-09-18T00:00:00Z', stale: false },
};

function agent(
  endpoint: string,
  label: string,
  state: KnownConnection['availability']['state'],
): KnownConnection {
  return {
    endpoint,
    label,
    source: 'recent',
    availability: { state, label: state, detail: `${label} is ${state}.` },
  };
}

function renderConnection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TooltipProvider>
          <ConnectionsSettings />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function row(name: string): HTMLElement {
  const element = screen.getByText(name).closest<HTMLElement>('[data-slot="item-row"]');
  if (!element) throw new Error(`No row for ${name}`);
  return element;
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.capabilities.mockResolvedValue(capabilities);
  repository.latestRelease.mockResolvedValue({
    version: '0.9.5.1',
    source: 'feed',
    checked_at: '2026-09-18T00:00:00Z',
    degradation: null,
  });
  switchConnection.mockResolvedValue(undefined);
  known.list = [
    agent('http://127.0.0.1:8100', 'CLIO local', 'healthy'),
    agent('http://ares.iit.edu', 'ares-genesis', 'healthy'),
    agent('http://10.0.4.12:8100', 'lab-shared', 'unavailable'),
  ];
});
afterEach(cleanup);

describe('ConnectionsSettings', () => {
  it('shows the address, transport, versions and the other agents with their status in words', async () => {
    renderConnection();

    expect(screen.getByLabelText('Address')).toHaveValue('http://127.0.0.1:8100');
    expect(screen.getByRole('combobox', { name: 'Transport' })).toHaveTextContent('Direct');
    expect(await screen.findByText('Up to date')).toBeVisible();
    expect(screen.getByText('v0.9.5.1')).toBeVisible();
    expect(screen.queryByText('CLIO local')).not.toBeInTheDocument();
    expect(within(row('ares-genesis')).getByText('Online')).toBeVisible();
    expect(within(row('lab-shared')).getByText('Offline')).toBeVisible();
    expect(
      within(row('lab-shared')).getByRole('button', { name: 'Switch to lab-shared' }),
    ).toBeDisabled();
  });

  it('switches to another agent without leaving settings', async () => {
    renderConnection();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to ares-genesis' }));
    await waitFor(() =>
      expect(switchConnection).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'http://ares.iit.edu', label: 'ares-genesis' }),
        { navigateToWorkspace: false },
      ),
    );
  });

  it('removes a saved agent after confirmation', async () => {
    renderConnection();
    fireEvent.click(within(row('lab-shared')).getByRole('button', { name: 'Remove lab-shared' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Remove/ }));
    expect(connection.forget).toHaveBeenCalledWith('http://10.0.4.12:8100');
  });

  it('adds an agent to switch to later', async () => {
    renderConnection();
    fireEvent.click(screen.getByRole('button', { name: 'Add an agent…' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'hpc-login' } });
    fireEvent.change(within(dialog).getByLabelText('Address'), {
      target: { value: 'https://hpc.example.org/' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Add/ }));
    expect(connection.rename).toHaveBeenCalledWith(
      { endpoint: 'https://hpc.example.org' },
      'hpc-login',
    );
    expect(switchConnection).not.toHaveBeenCalled();
  });

  it('switches to a typed address through the save bar', async () => {
    renderConnection();
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'not a url' } });
    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Address'), {
      target: { value: 'https://agent.example.org' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() =>
      expect(switchConnection).toHaveBeenCalledWith(
        { endpoint: 'https://agent.example.org' },
        { navigateToWorkspace: false },
      ),
    );
  });

  it('says when no other agent is saved', () => {
    known.list = [known.list[0]!];
    renderConnection();
    expect(screen.getByText(/No other agents saved/)).toBeVisible();
  });

  it('says in the Runtime row when the agent cannot be reached, with a Retry', async () => {
    repository.capabilities.mockRejectedValue(new Error('Request failed with 404 Not Found'));
    renderConnection();
    expect(await screen.findByText('Not reachable')).toBeVisible();
    expect(screen.queryByText(/404|Request failed/)).not.toBeInTheDocument();
    repository.capabilities.mockResolvedValue(capabilities);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Up to date')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
  });

  it('names an unlabelled agent by the agent name, with its host on the meta line', () => {
    known.list = [known.list[0]!, { ...agent('https://hpc.example.org', '', 'healthy') }];
    renderConnection();
    const item = screen.getByText('hpc.example.org').closest<HTMLElement>('[data-slot="item-row"]');
    expect(item).not.toBeNull();
    expect(
      within(item!).getByText('hpc.example.org').closest('[data-slot="item-row-meta"]'),
    ).not.toBeNull();
    expect(within(item!).getByRole('button', { name: /^Switch to / })).not.toHaveAccessibleName(
      'Switch to hpc.example.org',
    );
  });
});
