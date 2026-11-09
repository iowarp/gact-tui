import { infrastructureInventorySchema, type ToolCatalogItem } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InfrastructureActivity } from './infrastructure-activity';
import { InfrastructureHosts } from './infrastructure-hosts';
import { InfraTabActionsProvider } from './infrastructure-tab-actions';
import { InfrastructureTools } from './infrastructure-tools';

const repository = vi.hoisted(() => ({
  reconnectSessionMcpServer: vi.fn(),
  modelAcquisitionAction: vi.fn(),
  cancelInfrastructureOperation: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://owned-service' } }),
}));

vi.mock('./ssh-host-picker', () => ({ SshHostPicker: () => <p>Saved SSH computers</p> }));
vi.mock('./infrastructure-host-inspection', () => ({
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
function TabBar({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return (
    <>
      <div aria-label="Tab actions" ref={setTarget} role="toolbar" />
      <InfraTabActionsProvider value={target}>{children}</InfraTabActionsProvider>
    </>
  );
}
function show(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <MemoryRouter>
          <TabBar>{ui}</TabBar>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
afterEach(cleanup);

async function chooseFilter(trigger: string, option: RegExp) {
  await userEvent.click(screen.getByRole('button', { name: trigger }));
  await userEvent.click(screen.getByRole('menuitem', { name: option }));
}

it('filters failure history and offers a way back without losing the operation log', async () => {
  show(<InfrastructureActivity data={data} />);
  await chooseFilter('Activity filter: All', /^Failed/);
  expect(screen.queryByText('Stop SearXNG')).not.toBeInTheDocument();
  const row = screen.getByRole('button', { name: 'Install SearXNG details' });
  expect(row).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(row);
  expect(row).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Disk full')).toBeVisible();
  expect(screen.getByLabelText('Log for Install SearXNG')).toHaveTextContent(
    'Install could not continue.',
  );
  expect(screen.getByRole('link', { name: 'Go to service' })).toHaveAttribute(
    'href',
    '/infrastructure/services?target=homelab',
  );
  await userEvent.click(screen.getByRole('button', { name: 'View operation' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('Disk full')).toBeVisible();
  expect(within(dialog).queryByText('Install could not continue.')).not.toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('tab', { name: 'Log' }));
  expect(within(dialog).getByText('Install could not continue.')).toBeVisible();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search activity' }), 'missing');
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
  await userEvent.click(screen.getByRole('button', { name: 'Install SearXNG details' }));
  expect(screen.getByText('Installation stopped before it answered.')).toBeVisible();
  const rawMatch = (_: string, node: Element | null) =>
    node?.tagName === 'PRE' && node.textContent === error;
  expect(screen.queryByText(rawMatch)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'View operation' }));
  await userEvent.click(screen.getByRole('tab', { name: 'Log' }));
  const raw = screen.getByText(rawMatch);
  expect(raw).toBeVisible();
  expect(raw.textContent).toBe(error);
});

it('shows byte progress before opening an active download and searches the visible status', async () => {
  show(<InfrastructureActivity data={data} />);
  await chooseFilter('Activity filter: All', /^In progress/);
  const progress = screen.getByRole('progressbar', { name: 'Downloaded bytes for org/model' });
  expect(progress).toBeVisible();
  expect(progress).toHaveAttribute('aria-valuenow', '50');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await chooseFilter('Activity filter: In progress', /^All/);
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search activity' }), 'completed');
  expect(screen.getByText('Stop SearXNG')).toBeVisible();
  expect(screen.queryByText('Install SearXNG')).not.toBeInTheDocument();
});

it('cancels an active download and retries a failed one from the activity row', async () => {
  repository.modelAcquisitionAction.mockResolvedValue({});
  const failed = { ...data.model_acquisitions[0], id: 'broken', state: 'failed' as const };
  show(
    <InfrastructureActivity
      data={{ ...data, operations: [], model_acquisitions: [data.model_acquisitions[0], failed] }}
    />,
  );
  const [active, broken] = screen.getAllByRole('listitem');
  await userEvent.click(within(active).getByRole('button', { name: 'Cancel Download org/model' }));
  expect(repository.modelAcquisitionAction).toHaveBeenCalledWith('homelab', 'download', 'cancel');
  expect(
    within(active).getByRole('button', { name: 'Download org/model details' }),
  ).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(within(broken).getByRole('button', { name: 'Retry Download org/model' }));
  expect(repository.modelAcquisitionAction).toHaveBeenCalledWith('homelab', 'broken', 'retry');
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

it('explains the Desktop connection requirement without showing an unusable add button', async () => {
  show(<InfrastructureHosts data={data} onSelect={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Add computer' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'About computers' }));
  expect(
    (await screen.findAllByText(/Add SSH computers in the Desktop app\./)).length,
  ).toBeGreaterThan(0);
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
  expect(screen.getByRole('radio', { name: 'This session' })).toBeChecked();
  await userEvent.click(screen.getByRole('radio', { name: 'All agent tools' }));
  expect(scope).toHaveBeenLastCalledWith('agent');
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
  show(
    <InfrastructureTools
      pending={false}
      servers={[]}
      sessionScoped={false}
      tools={tools}
      onScope={vi.fn()}
    />,
  );
  expect(screen.getByRole('list', { name: 'Built in' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Search tools' }));
  const search = screen.getByRole('searchbox', { name: 'Search tools' });
  expect(search).toHaveFocus();
  await userEvent.type(search, 'search web');
  expect(screen.queryByRole('list', { name: 'Built in' })).not.toBeInTheDocument();
  const mcp = screen.getByRole('list', { name: 'MCP servers' });
  await userEvent.click(within(mcp).getByRole('button', { name: 'search_web' }));
  expect(screen.getByRole('heading', { name: 'Search web' })).toBeVisible();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.clear(search);
  await chooseFilter('Tool source: All', /^Built in/);
  expect(screen.queryByRole('list', { name: 'MCP servers' })).not.toBeInTheDocument();
  await userEvent.type(search, 'missing');
  expect(screen.getByText('No tools match “missing”.')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByRole('button', { name: 'read_file' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'search_web' })).toBeVisible();
});

it('inspects a tool from its hover action and shows its status and source', async () => {
  const tools = [
    {
      id: 'collect',
      name: 'collect',
      title: 'Collect',
      description: 'Collects samples\nwith a long second line',
      server_id: 'lab',
      enabled: false,
      input_schema: {},
      output_schema: {},
      tags: [],
      visible_to: [],
    },
  ] as ToolCatalogItem[];
  show(
    <InfrastructureTools
      pending={false}
      servers={[]}
      sessionScoped={false}
      tools={tools}
      onScope={vi.fn()}
    />,
  );
  const row = screen.getByRole('listitem');
  expect(within(row).getByText('Collects samples')).toBeVisible();
  expect(within(row).getByText('Off')).toBeVisible();
  expect(within(row).getByText('Lab')).toBeInTheDocument();
  await userEvent.click(within(row).getByRole('button', { name: 'Inspect collect' }));
  const sheet = screen.getByRole('dialog');
  expect(within(sheet).getByRole('heading', { name: 'Collect' })).toBeVisible();
  expect(within(sheet).getByText('Inputs')).toBeVisible();
});
