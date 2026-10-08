import type { InfrastructureInventory, ToolCatalogItem } from '@clio/core/v3';
import { targetFactsSchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ managed: true }));
const native = vi.hoisted(() => vi.fn());
const repository = vi.hoisted(() => ({
  inspectHostPath: vi.fn(),
  managedServiceCatalog: vi.fn(),
  savedServers: vi.fn(),
  sandboxStatus: vi.fn(),
  setupSandbox: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://127.0.0.1:8788' },
    isManagedConnection: state.managed,
  }),
}));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => true }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: native }));
vi.mock('@/tauri/managed-backend', () => ({ restartClio: vi.fn() }));
import { HostPathPicker } from './host-path-picker';
import { InfrastructureOverview } from './infrastructure-overview';
import { CatalogToolset } from './catalog-toolset';
import { displayHostPath } from '@/lib/host-path-display';
import { InfrastructureFoundationGroups } from '@/routes/infrastructure-foundation-groups';
import { SandboxFoundationRow } from '@/routes/infrastructure-sandbox-row';

function show(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.managed = true;
  repository.inspectHostPath.mockResolvedValue({
    exists: true,
    path: '/home/alice/data',
    existing_ancestor: '/home/alice',
    parent: '/home/alice',
    entries: [],
    truncated: false,
  });
  repository.managedServiceCatalog.mockResolvedValue({
    facts: {
      label: 'Local',
      os: 'windows',
      arch: 'x86_64',
      accelerator: 'none',
      container_runtimes: [],
      hostname: 'WORKSTATION',
      home: 'C:\\Users\\Alice',
    },
  });
  repository.savedServers.mockResolvedValue([
    {
      id: 'custom',
      label: 'My running server',
      address: 'http://localhost:8088/v1',
      check: { reachable: true },
    },
  ]);
  repository.sandboxStatus.mockResolvedValue({ name: 'sandbox', status: 'ready' });
});
afterEach(cleanup);

it('uses the native picker only for the Desktop managed computer and cleans Windows display paths', async () => {
  native.mockResolvedValue('C:\\models');
  const chosen = vi.fn();
  show(
    <HostPathPicker
      targetId="local"
      hostLabel="This computer"
      label="Storage root"
      path={'\\\\?\\C:\\CLIO data'}
      onChoose={chosen}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: /Browse storage root/ }));
  await screen.findByRole('button', { name: /Browse storage root/ });
  expect(native).toHaveBeenCalledWith({
    directory: true,
    multiple: false,
    defaultPath: 'C:\\CLIO data',
  });
  expect(chosen).toHaveBeenCalledWith('C:\\models');
  expect(repository.inspectHostPath).not.toHaveBeenCalled();
  expect(displayHostPath('\\\\?\\UNC\\server\\share')).toBe('\\\\server\\share');
});

it('keeps the folder browser on a remote target and on a tunneled CLIO connection', async () => {
  const view = show(
    <HostPathPicker
      targetId="ares"
      hostLabel="Ares"
      label="Storage root"
      path="/home/alice/data"
      onChoose={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: /Browse storage root/ }));
  await screen.findByText('Browsing Ares');
  await screen.findByText('No subfolders');
  expect(repository.inspectHostPath).toHaveBeenCalledWith(
    'ares',
    expect.anything(),
    expect.anything(),
  );
  expect(native).not.toHaveBeenCalled();
  view.unmount();
  state.managed = false;
  show(
    <HostPathPicker
      targetId="local"
      hostLabel="Tunneled CLIO"
      label="Storage root"
      path="/home/alice/data"
      onChoose={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: /Browse storage root/ }));
  await screen.findByText('Browsing Tunneled CLIO');
  expect(native).not.toHaveBeenCalled();
});

it('groups each health row once and updates the counts from the live sandbox status', async () => {
  show(
    <InfrastructureFoundationGroups
      integrations={[
        { name: 'api', status: 'ready' },
        { name: 'lm_provider', status: 'degraded' },
        { name: 'sandbox', status: 'degraded' },
      ]}
      renderRow={(row) => <div key={row.name}>{row.name}</div>}
    />,
  );
  await screen.findByText('Ready and working (2)');
  expect(screen.getByText('Warnings (1)')).toBeVisible();
  expect(screen.getAllByText('sandbox')).toHaveLength(1);
  expect(screen.getByLabelText('Ready and working (2)')).not.toHaveAttribute('open');
});

it('shows the sandbox setup result instead of silently discarding it', async () => {
  repository.sandboxStatus.mockResolvedValue({
    name: 'sandbox',
    status: 'degraded',
    summary: 'Not verified',
    setup_in_progress: false,
  });
  repository.setupSandbox.mockResolvedValue({
    reason: 'codex_enforcement_unverified',
    row: {
      name: 'sandbox',
      status: 'degraded',
      summary: 'Windows setup finished but enforcement still needs verification.',
    },
  });
  show(<SandboxFoundationRow integration={{ name: 'sandbox', status: 'degraded' }} />);
  await userEvent.click(await screen.findByText('Protected execution'));
  await userEvent.click(screen.getByRole('button', { name: 'Set up protected execution' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Windows setup finished but enforcement still needs verification.',
  );
});

it('shows saved provider servers and preserves actual host facts in the topology overview', async () => {
  const facts = targetFactsSchema.parse({
    target_id: 'local',
    label: 'Local',
    transport_state: 'connected',
    os: 'windows',
    arch: 'x86_64',
    accelerator: 'none',
    docker_available: false,
    docker_installed: false,
    uv_available: true,
    hostname: 'WORKSTATION',
    home: 'C:\\Users\\Alice',
    identity: 'Alice',
    agent_data_root: 'C:\\CLIO data',
  });
  expect(facts.home).toBe('C:\\Users\\Alice');
  show(
    <InfrastructureOverview
      data={
        {
          targets: [],
          services: [],
          connections: [],
          operations: [],
          model_acquisitions: [],
        } as InfrastructureInventory
      }
      targetId="local"
      onTarget={vi.fn()}
    />,
  );
  expect(await screen.findByText('My running server')).toBeVisible();
  expect(await screen.findByText('Computer: WORKSTATION')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Provider setup' })).toHaveAttribute(
    'href',
    '/settings/providers',
  );
  expect(screen.getByLabelText('Connection map').querySelector('svg path')).not.toBeNull();
});

it('keeps the tool-list action outside the selected tool contract', async () => {
  const tool = {
    id: 'collect',
    name: 'get_agent_task_output',
    title: 'Collect',
    description: 'Collect completed task output.',
    source: 'native',
    visible_to: [],
    tags: [],
    input_schema: {},
    output_schema: {},
  } as ToolCatalogItem;
  show(<CatalogToolset tools={[tool]} />);
  expect(screen.getByRole('heading', { name: /^Collect$/ })).toBeVisible();
  const action = screen.getByRole('button', { name: 'View tool list' });
  expect(action.closest('article')).toBeNull();
  await userEvent.click(action);
  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Browse tools' })).toBeVisible();
});
