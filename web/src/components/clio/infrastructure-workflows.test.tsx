import { infrastructureInventorySchema, type ToolCatalogItem } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { InfrastructureActivity } from './infrastructure-activity';
import { InfrastructureHosts } from './infrastructure-hosts';
import { CatalogToolset } from './catalog-toolset';
import { InfrastructureTools } from './infrastructure-tools';

vi.mock('./ssh-host-picker', () => ({ SshHostPicker: () => <p>Saved SSH computers</p> }));
vi.mock('./infrastructure-overview', () => ({
  InfrastructureHostInspection: ({ targetId }: { targetId: string }) => <p>Inspect {targetId}</p>,
}));
const data = infrastructureInventorySchema.parse({
  targets: [
    {
      id: 'local',
      kind: 'local',
      label: 'Local',
      transport_state: 'connected',
      created_at: '',
      updated_at: '',
    },
    {
      id: 'homelab',
      kind: 'ssh',
      label: 'Homelab',
      transport_state: 'disconnected',
      created_at: '',
      updated_at: '',
      ssh: { host: 'lab', port: 22 },
    },
  ],
  services: [],
  connections: [],
  operations: [
    {
      id: 'failed',
      action: 'install',
      service_id: 'searxng',
      target_id: 'homelab',
      state: 'failed',
      updated_at: '2026-10-15T04:00:00Z',
      created_at: '',
      progress: '',
      error: 'Disk full',
      logs: 'Install could not continue.',
    },
    {
      id: 'done',
      action: 'stop',
      service_id: 'searxng',
      target_id: 'local',
      state: 'succeeded',
      updated_at: '2026-10-15T05:00:00Z',
      progress: 'Stopped',
      created_at: '',
      logs: '',
    },
  ],
  model_acquisitions: [
    {
      id: 'download',
      repository: 'org/model',
      target_id: 'homelab',
      state: 'running',
      updated_at: 1792047600,
      phase: 'Downloading files',
      bytes_done: 50,
      bytes_total: 100,
      requested_revision: 'main',
      revision: null,
      destination: '/owned/models',
      created_at: 1792047600,
      error: null,
    },
  ],
});
function show(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(cleanup);

it('filters failure history and offers a way back without losing the operation log', async () => {
  show(<InfrastructureActivity data={data} />);
  await userEvent.click(screen.getByRole('button', { name: 'Failed 1' }));
  expect(screen.queryByText('Stop SearXNG')).not.toBeInTheDocument();
  await userEvent.click(screen.getByText('Install SearXNG'));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('Disk full')).toBeVisible();
  expect(within(dialog).queryByText('Install could not continue.')).not.toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('tab', { name: 'Log' }));
  expect(screen.getByText('Install could not continue.')).toBeVisible();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  await userEvent.click(screen.getByRole('button', { name: 'Actions for Install SearXNG' }));
  expect(screen.getByRole('menuitem', { name: 'Go to service' })).toHaveAttribute(
    'href',
    '/infrastructure/services?target=homelab',
  );
  await userEvent.keyboard('{Escape}');
  await userEvent.type(screen.getByRole('textbox', { name: 'Search activity' }), 'missing');
  expect(screen.getByText('No matching activity.')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByText('Stop SearXNG')).toBeVisible();
});

it('keeps a long failure reason behind technical details without losing its original bytes', async () => {
  const error =
    'Installation stopped before it answered. Last output: ' + 'controller source\n'.repeat(80);
  show(
    <InfrastructureActivity
      data={{ ...data, model_acquisitions: [], operations: [{ ...data.operations[0], error }] }}
    />,
  );
  await userEvent.click(screen.getByText('Install SearXNG'));
  expect(
    within(screen.getByRole('dialog')).getByText('Installation stopped before it answered.'),
  ).toBeVisible();
  const rawMatch = (_: string, node: Element | null) =>
    node?.tagName === 'PRE' && node.textContent === error;
  expect(screen.queryByText(rawMatch)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: 'Log' }));
  const raw = screen.getByText(rawMatch);
  expect(raw).toBeVisible();
  expect(raw.textContent).toBe(error);
});

it('shows byte progress before opening an active download and searches the visible status', async () => {
  show(<InfrastructureActivity data={data} />);
  await userEvent.click(screen.getByRole('button', { name: 'In progress 1' }));
  const progress = screen.getByRole('progressbar', { name: 'Downloaded bytes for org/model' });
  expect(progress).toBeVisible();
  expect(progress).toHaveAttribute('value', '50');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'All 3' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Search activity' }), 'completed');
  expect(screen.getByText('Stop SearXNG')).toBeVisible();
  expect(screen.queryByText('Install SearXNG')).not.toBeInTheDocument();
});

it('offers useful setup actions in empty activity', () => {
  show(<InfrastructureActivity data={{ ...data, operations: [], model_acquisitions: [] }} />);
  expect(screen.getByRole('link', { name: 'Set up a service' })).toHaveAttribute(
    'href',
    '/infrastructure/services',
  );
  expect(screen.getByRole('link', { name: 'Download a model' })).toHaveAttribute(
    'href',
    '/infrastructure/models',
  );
});

it('opens Add computer in one click and selects the inspected host before reading its capabilities', async () => {
  const select = vi.fn();
  const connect = vi.fn().mockResolvedValue(undefined);
  show(
    <InfrastructureHosts data={data} onSelect={select} onConnectComputer={connect}>
      <p>Agent health</p>
    </InfrastructureHosts>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Add computer' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.getByText('Saved SSH computers')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Homelab details' }));
  expect(select).toHaveBeenCalledWith('homelab');
  expect(screen.getByText('Inspect homelab')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Models on Homelab' })).toHaveAttribute(
    'href',
    '/infrastructure/models?target=homelab',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
  expect(connect).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'homelab', host: 'lab', port: 22 }),
  );
});

it('explains the Desktop connection requirement without showing an unusable add button', () => {
  show(<InfrastructureHosts data={data} onSelect={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Add computer' })).not.toBeInTheDocument();
  expect(screen.getByText('Add SSH computers in Desktop')).toBeVisible();
});

it('keeps an empty session honest while giving a direct route to the catalog', async () => {
  const scope = vi.fn();
  show(
    <InfrastructureTools
      sessionId="session"
      sessionScoped
      pending={false}
      tools={[]}
      servers={[]}
      onScope={scope}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Browse all agent tools' }));
  expect(scope).toHaveBeenCalledWith('agent');
  expect(screen.queryByText('Inputs')).not.toBeInTheDocument();
});

it('searches across built-in and connected tools, opens matched groups and clears empty filters', async () => {
  const base = {
    description: 'Reads documents',
    input_schema: {},
    output_schema: {},
    tags: [],
    visible_to: [],
  };
  const tools = [
    { ...base, id: 'read_file', name: 'read_file', title: 'Read file' },
    { ...base, id: 'search_web', name: 'search_web', title: 'Search web', server_id: 'web' },
  ] as ToolCatalogItem[];
  show(<CatalogToolset tools={tools} />);
  await userEvent.click(screen.getByRole('button', { name: 'View tool list' }));
  const sheet = screen.getByRole('dialog');
  await userEvent.type(within(sheet).getByRole('textbox', { name: 'Search tools' }), 'search web');
  expect(within(sheet).getByRole('button', { name: 'Search web' })).toBeVisible();
  await userEvent.click(within(sheet).getByRole('button', { name: 'Search web' }));
  expect(screen.getByRole('heading', { name: 'Search web' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'View tool list' }));
  await userEvent.type(
    within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Search tools' }),
    'missing',
  );
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear filters' }),
  );
  expect(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Read file' }),
  ).toBeVisible();
});
