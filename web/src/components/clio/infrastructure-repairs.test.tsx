import type { InfrastructureInventory, ToolCatalogItem } from '@clio/core/v3';
import { targetFactsSchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
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
import { InfrastructureHosts } from './infrastructure-hosts';
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
  expect(screen.queryByLabelText('Errors (0)')).not.toBeInTheDocument();
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
    identity: { uid: -1, gid: -1 },
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
  expect(screen.getByRole('list', { name: /Connections from this client/u })).toBeInTheDocument();
  expect(repository.managedServiceCatalog).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByText('Saved model servers (1)'));
  expect(await screen.findByText('My running server')).toBeVisible();
  await userEvent.click(screen.getByText('Computer details'));
  expect(await screen.findByText('Home: C:\\Users\\Alice')).not.toBeVisible();
  await userEvent.click(await screen.findByText('Computer identity & paths'));
  expect(screen.getByText('Home: C:\\Users\\Alice')).toBeVisible();
  expect(await screen.findByText('Computer: WORKSTATION')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Model providers' })).toHaveAttribute(
    'href',
    '/settings/providers',
  );
  expect(
    within(screen.getByLabelText('Connection map')).getByRole('link', {
      name: /Manage services on connected/u,
    }),
  ).toHaveAttribute('href', '/infrastructure/services?target=local');
  expect(screen.getByRole('link', { name: 'Inspect agent' })).toHaveAttribute(
    'href',
    '/infrastructure/agent',
  );
});

const failedInstallInventory = {
  targets: [],
  services: [
    {
      id: 'local:searxng',
      target_id: 'local',
      service_id: 'searxng',
      // What the agent records after an install that exited 1 and was stopped.
      state: 'unknown',
      updated_at: '2026-10-23T19:16:35Z',
      configuration: {},
      observation: {
        definition_version: 'searxng-native-2',
        configuration_revision: 'abc',
        phase: 'stopped',
        installed: false,
        running: false,
        serving: false,
        worker_alive: false,
        provenance_ingesting: false,
        attention_verified: false,
        evidence_directory: '',
        error: 'install exited with code 1; inspect its logs',
        observed_at: 1,
      },
    },
  ],
  connections: [],
  operations: [],
  model_acquisitions: [],
} as InfrastructureInventory;

it('says the built-in search engine is not installed, with Install, in the map and the web research row', async () => {
  show(
    <InfrastructureOverview
      data={failedInstallInventory}
      targetId="local"
      onTarget={vi.fn()}
      onManageWebSearch={vi.fn()}
    />,
  );
  const map = screen.getByLabelText('Connection map');
  expect(within(map).getByText('SearXNG')).toBeVisible();
  expect(within(map).getByText('Not installed')).toBeVisible();
  expect(within(map).queryByText('Not checked')).not.toBeInTheDocument();
  expect(screen.queryByText('No research service connected')).not.toBeInTheDocument();
  expect(screen.getByText('Built-in search engine: SearXNG')).toBeVisible();
  expect(
    screen.getByText('The last installation did not finish. Install it to use it.'),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: /Install SearXNG/u })).toHaveAttribute(
    'href',
    '/infrastructure/services?target=local&service=searxng',
  );
});

it('lays the setup map out flat: no framed card inside a framed box', () => {
  show(
    <InfrastructureOverview data={failedInstallInventory} targetId="local" onTarget={vi.fn()} />,
  );
  const map = screen.getByRole('list', { name: /Connections from this client/u });
  // This client → connected agent → remote computers, as three sibling steps.
  expect(map.querySelectorAll(':scope > [role="listitem"]')).toHaveLength(3);
  expect(map.querySelectorAll('[class*="rounded-xl"], [class*="bg-muted"]')).toHaveLength(0);
  expect(screen.getByRole('link', { name: /Manage services on connected/u }).className).not.toMatch(
    /\bborder\b/u,
  );
});

it('shows what needs attention on the computer it belongs to', () => {
  show(
    <InfrastructureHosts
      data={
        {
          targets: [
            {
              id: 'local',
              label: 'Local',
              kind: 'local',
              install_root: '',
              transport_state: 'connected',
              auto_reconnect: true,
              created_at: '',
              updated_at: '',
            },
          ],
          services: [],
          connections: [],
          operations: [],
          model_acquisitions: [],
        } as unknown as InfrastructureInventory
      }
      onSelect={vi.fn()}
      localAttention={['Memory service process']}
    />,
  );
  expect(
    within(screen.getByRole('region', { name: 'Local computer' })).getByText(
      /Needs attention: Memory service process/u,
    ),
  ).toBeVisible();
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
