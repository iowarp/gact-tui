import type { InfrastructureInventory } from '@clio/core/v3';
import { targetFactsSchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
import { InfraTabActionsProvider } from './infrastructure-tab-actions';
import { InfrastructureHosts } from './infrastructure-hosts';
import { InfrastructureHostInspection } from './infrastructure-host-inspection';
import { TooltipProvider } from '@/components/ui/tooltip';
import { displayHostPath } from '@/lib/host-path-display';
import { InfrastructureFoundationGroups } from '@/routes/infrastructure-foundation-groups';
import { SandboxFoundationRow } from '@/routes/infrastructure-sandbox-row';

function show(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </TooltipProvider>
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
      renderRow={(row) => (
        <div key={row.name} role="listitem">
          {row.name}
        </div>
      )}
    />,
  );
  const ready = await screen.findByRole('list', { name: 'Ready and working' });
  await waitFor(() => expect(within(ready).getAllByRole('listitem')).toHaveLength(2));
  expect(
    within(screen.getByRole('list', { name: 'Warnings' })).getAllByRole('listitem'),
  ).toHaveLength(1);
  expect(screen.getAllByText('sandbox')).toHaveLength(1);
  expect(screen.queryByRole('list', { name: 'Errors' })).not.toBeInTheDocument();
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

it('keeps the actual Windows home path in parsed host facts', () => {
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
});

it('summarises saved model servers and opens each role and map node where it is managed', async () => {
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
    />,
  );
  expect(await screen.findByText('1 connected')).toBeVisible();
  expect(screen.getByText('My running server')).toBeVisible();
  expect(repository.managedServiceCatalog).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Open Agent' })).toHaveAttribute(
    'href',
    '/infrastructure/agent',
  );
  expect(screen.getByRole('link', { name: 'Open Inference' })).toHaveAttribute(
    'href',
    '/infrastructure/services',
  );
  const more = screen.getByRole('navigation', { name: 'More infrastructure' });
  expect(within(more).getByRole('link', { name: 'Models & storage' })).toHaveAttribute(
    'href',
    '/infrastructure/models',
  );
  const map = screen.getByLabelText('Connection map');
  expect(
    within(map).getByRole('list', { name: /Connections from this client/u }),
  ).toBeInTheDocument();
  expect(within(map).getByRole('link', { name: /Manage services on connected/u })).toHaveAttribute(
    'href',
    '/infrastructure/services?target=local',
  );
  expect(within(map).getByRole('link', { name: /Add a computer/u })).toHaveAttribute(
    'href',
    '/infrastructure/agent',
  );
});

it('reconnects a computer that needs sign-in from its map node and inspects again from the tab bar', async () => {
  const reconnect = vi.fn().mockResolvedValue(undefined);
  const slot = document.createElement('div');
  document.body.append(slot);
  show(
    <InfraTabActionsProvider value={slot}>
      <InfrastructureOverview
        data={
          {
            targets: [
              {
                id: 'ares',
                label: 'ares',
                kind: 'ssh',
                install_root: '',
                ssh: { profile: '', host: 'ares.example', user: 'alice', port: 22, jump_hosts: [] },
                transport_state: 'connected',
                auto_reconnect: true,
                created_at: '',
                updated_at: '',
              },
              {
                id: 'polaris',
                label: 'polaris',
                kind: 'ssh',
                install_root: '',
                ssh: { profile: '', host: 'polaris.example', user: '', port: 22, jump_hosts: [] },
                transport_state: 'reauthentication_required',
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
        targetId="local"
        onReconnect={reconnect}
      />
    </InfraTabActionsProvider>,
  );
  const map = screen.getByLabelText('Connection map');
  expect(
    within(map).getByRole('link', { name: /Services on ares, SSH: Connected/u }),
  ).toHaveAttribute('href', '/infrastructure/services?target=ares');
  const polaris = within(map).getByRole('button', {
    name: /Reconnect polaris, SSH: Sign-in needed/u,
  });
  polaris.focus();
  await userEvent.keyboard('{Enter}');
  expect(reconnect).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'polaris', host: 'polaris.example', port: 22 }),
  );
  await screen.findByText('1 connected');
  expect(repository.savedServers).toHaveBeenCalledTimes(1);
  await userEvent.click(within(slot).getByRole('button', { name: 'Inspect again' }));
  expect(repository.savedServers).toHaveBeenCalledTimes(2);
  slot.remove();
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
  const local = screen.getByRole('button', { name: 'Local details' }).closest('[role="listitem"]');
  expect(
    within(local as HTMLElement).getByText(/Needs attention: Memory service process/u),
  ).toBeVisible();
});

it('reads computer capabilities as facts and inspects the computer again', async () => {
  show(<InfrastructureHostInspection targetId="local" />);
  const facts = await screen.findByRole('region', { name: 'Computer capabilities' });
  expect(await within(facts).findByText('WORKSTATION')).toBeVisible();
  expect(within(facts).getByText('C:\\Users\\Alice')).toBeVisible();
  expect(repository.managedServiceCatalog).toHaveBeenCalledTimes(1);
  await userEvent.click(within(facts).getByRole('button', { name: 'Inspect again' }));
  await waitFor(() => expect(repository.managedServiceCatalog).toHaveBeenCalledTimes(2));
});
