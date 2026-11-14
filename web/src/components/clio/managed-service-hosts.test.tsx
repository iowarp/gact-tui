import { brand } from '@brand';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';

const runtime = vi.hoisted(() => ({ desktop: true }));
const deployment = vi.hoisted(() => ({
  managedServiceCatalog: vi.fn(),
  runManagedServiceAction: vi.fn(),
  listSshProfiles: vi.fn(),
  saveSshProfile: vi.fn(),
}));
const installerInfra = vi.hoisted(() => ({ installerRequestedLlamaCpp: vi.fn() }));
const connection = vi.hoisted(() => ({
  isManagedConnection: true,
  settings: { endpoint: 'http://127.0.0.1:17800', token: 'test-token' },
}));
const repository = vi.hoisted(() => ({
  workspaces: vi.fn(),
  mcpServers: vi.fn(),
  savedMcpServices: vi.fn(),
  tools: vi.fn(),
  infrastructureInventory: vi.fn(),
  infrastructureTargets: vi.fn(),
  createInfrastructureTarget: vi.fn(),
  updateInfrastructureTarget: vi.fn(),
  setInfrastructureTransportState: vi.fn(),
  managedServiceCatalog: vi.fn(),
  runManagedServiceAction: vi.fn(),
  infrastructureOperation: vi.fn(),
  // The live operation stream: these tests read the polled record only.
  infrastructureOperationEvents: vi.fn(async function* () {}),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => runtime.desktop }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(vi.fn()) }));
vi.mock('@/tauri/ssh-profiles', () => ({
  listSshProfiles: deployment.listSshProfiles,
  saveSshProfile: deployment.saveSshProfile,
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({ useConnectionSettings: () => connection }));
vi.mock('@/tauri/ssh-infrastructure-transport', () => ({
  attachInfrastructureSshTransport: vi.fn().mockResolvedValue({
    session_id: 'ssh-test',
    state: 'connected',
    reused: false,
    output: '',
  }),
  sshTransportStatus: vi.fn().mockResolvedValue({
    session_id: 'ssh-test',
    state: 'connected',
    reused: true,
    output: '',
  }),
  writeSshTransport: vi.fn(),
}));
vi.mock('@/lib/installer-infrastructure', () => installerInfra);
vi.mock('@/tauri/ssh-credentials', () => ({
  deleteSshPassword: vi.fn().mockResolvedValue(undefined),
  storeSshIdentity: vi.fn(),
  storeSshPassword: vi.fn().mockResolvedValue(undefined),
}));

import { ManagedServices } from './managed-services';
import { InfraTabActionsProvider } from './infrastructure-tab-actions';
import { TooltipProvider } from '@/components/ui/tooltip';
import { localServiceFacts, services } from '@/test-fixtures/managed-services';

function renderServices(props: ComponentProps<typeof ManagedServices> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <TooltipProvider>
          <InfraTabActionsProvider value={document.body}>
            <ManagedServices {...props} />
          </InfraTabActionsProvider>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  repository.workspaces.mockResolvedValue([]);
  repository.mcpServers.mockResolvedValue([]);
  repository.savedMcpServices.mockResolvedValue([]);
  repository.tools.mockResolvedValue([]);
  repository.infrastructureInventory.mockResolvedValue({ operations: [] });
  localStorage.clear();
  runtime.desktop = true;
  connection.isManagedConnection = true;
  deployment.managedServiceCatalog.mockResolvedValue({
    facts: localServiceFacts,
    services,
  });
  deployment.listSshProfiles.mockResolvedValue([]);
  deployment.saveSshProfile.mockImplementation(async (input) => ({
    name: input.name,
    hostname: input.hostname,
    user: input.user,
    port: input.port,
    identity_file: input.identity_file || undefined,
    jump_hosts: input.jump_hosts,
    platform: input.platform,
    managed: true,
  }));
  installerInfra.installerRequestedLlamaCpp.mockResolvedValue(false);
  deployment.runManagedServiceAction.mockResolvedValue({
    service_id: 'notebook_server',
    action: 'status',
    target: 'this computer',
    status: 'ok',
    logs: 'running',
  });
  repository.infrastructureTargets.mockResolvedValue([
    {
      id: 'local',
      label: "This CLIO's computer",
      kind: 'local',
      install_root: '',
      transport_state: 'connected',
      auto_reconnect: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]);
  repository.createInfrastructureTarget.mockImplementation(async (input) => ({
    id: 'ssh-target',
    label: input.label,
    kind: 'ssh',
    install_root: input.install_root ?? '',
    ssh: input.ssh,
    transport_state: 'connected',
    auto_reconnect: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }));
  repository.setInfrastructureTransportState.mockResolvedValue(undefined);
  repository.managedServiceCatalog.mockImplementation(deployment.managedServiceCatalog);
  repository.runManagedServiceAction.mockImplementation(async (serviceId, input) => {
    const result = await deployment.runManagedServiceAction({ ...input, service_id: serviceId });
    return {
      id: 'op-1',
      service_id: result.service_id,
      target_id: input.target_id,
      action: result.action,
      state: 'succeeded',
      progress: 'Completed',
      logs: result.logs,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
  });
  repository.infrastructureOperation.mockResolvedValue({
    id: 'op-1',
    service_id: 'notebook_server',
    target_id: 'local',
    action: 'status',
    state: 'succeeded',
    progress: 'Completed',
    logs: 'running',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openComputerMenu(user = userEvent.setup()) {
  await user.click(await screen.findByRole('button', { name: /^Computer: / }));
}

async function chooseComputer(current: string, next: string, user = userEvent.setup()) {
  await user.click(await screen.findByRole('button', { name: `Computer: ${current}` }));
  await user.click(await screen.findByRole('option', { name: (name) => name.startsWith(next) }));
}

describe('ManagedServices computer selection', () => {
  it('lets a browser select an already registered remote host without creating a Desktop transport', async () => {
    runtime.desktop = false;
    repository.infrastructureTargets.mockResolvedValue([
      { id: 'local', label: 'Local', kind: 'local', transport_state: 'connected' },
      {
        id: 'homelab',
        label: 'Homelab',
        kind: 'ssh',
        transport_state: 'connected',
        ssh: { profile: 'homelab', jump_hosts: [] },
      },
    ]);
    renderServices();
    await chooseComputer('Local', 'Homelab');
    await waitFor(() =>
      expect(repository.managedServiceCatalog).toHaveBeenCalledWith(
        'homelab',
        expect.any(AbortSignal),
      ),
    );
    expect(repository.createInfrastructureTarget).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox', { name: 'Saved SSH host' })).not.toBeInTheDocument();
  });
  it('limits a remote CLIO to lifecycle management on its own computer', async () => {
    connection.isManagedConnection = false;
    renderServices({
      connectedAgentLabel: 'Utah CLIO',
      connectedAgentLocation: 'Utah',
    });
    expect(await screen.findByRole('button', { name: 'Computer: Local' })).toBeVisible();
    await openComputerMenu();
    expect(screen.getByRole('option', { name: /^Add computer/u })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.queryByText('This connection would not be reachable')).not.toBeInTheDocument();
  });

  it('keeps the infrastructure view usable while target inspection is pending', () => {
    deployment.managedServiceCatalog.mockReturnValue(new Promise(() => undefined));
    renderServices();

    expect(screen.getByRole('button', { name: 'Computer: Local' })).toBeVisible();
    expect(screen.getByText('Inspecting this computer')).toBeVisible();
  });

  it('identifies the selected SSH host while remote discovery is running', async () => {
    const user = userEvent.setup();
    deployment.listSshProfiles.mockResolvedValue([
      { name: 'homelab', port: 22, jump_hosts: [], platform: 'linux', managed: false },
    ]);
    deployment.managedServiceCatalog.mockImplementation((targetId: string) =>
      targetId === 'ssh-target'
        ? new Promise(() => undefined)
        : Promise.resolve({
            facts: {
              target: 'local',
              os: 'windows',
              arch: 'x86_64',
              accelerator: 'none',
              docker_available: true,
              docker_installed: true,
              uv_available: true,
            },
            services,
          }),
    );
    renderServices();
    await openComputerMenu(user);
    await user.click(screen.getByRole('option', { name: 'Add computer' }));
    await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: 'homelab' }));

    expect(await screen.findByText('Connecting to homelab')).toBeVisible();
    expect(screen.getByText(new RegExp(`existing ${brand.agentName} services`, 'u'))).toBeVisible();
  });

  it('reuses a host registered before the target list answered instead of adding a duplicate', async () => {
    const user = userEvent.setup();
    const registered = {
      id: 'homelab',
      label: 'homelab',
      kind: 'ssh' as const,
      install_root: '',
      ssh: {
        profile: 'homelab',
        host: '',
        user: '',
        port: 22,
        identity_file: '',
        jump_hosts: [],
        platform: 'linux' as const,
      },
      transport_state: 'disconnected' as const,
      auto_reconnect: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    deployment.listSshProfiles.mockResolvedValue([
      { name: 'homelab', port: 22, jump_hosts: [], platform: 'linux', managed: false },
    ]);
    // The page's own targets query never answers (a slow reload); the
    // registration must still find the stored host.
    repository.infrastructureTargets
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValue([registered]);
    repository.updateInfrastructureTarget.mockResolvedValue(registered);
    renderServices();
    await openComputerMenu(user);
    await user.click(screen.getByRole('option', { name: 'Add computer' }));
    await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: 'homelab' }));

    await waitFor(() =>
      expect(repository.updateInfrastructureTarget).toHaveBeenCalledWith(
        'homelab',
        expect.objectContaining({ kind: 'ssh' }),
      ),
    );
    expect(repository.createInfrastructureTarget).not.toHaveBeenCalled();
  });

  it('adds a manual SSH host beside imported profiles and uses it for inspection', async () => {
    const user = userEvent.setup();
    const create = repository.createInfrastructureTarget.getMockImplementation()!;
    repository.createInfrastructureTarget.mockImplementationOnce(async (input) => {
      const created = await create(input);
      repository.infrastructureTargets.mockResolvedValue([
        { id: 'local', label: 'Local', kind: 'local', transport_state: 'connected' },
        created,
      ]);
      return created;
    });
    renderServices();
    await openComputerMenu(user);
    await user.click(screen.getByRole('option', { name: 'Add computer' }));
    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
    await user.type(screen.getByLabelText('Address'), 'login.example.edu');
    await user.clear(screen.getByLabelText('Port'));
    await user.type(screen.getByLabelText('Port'), '2222');
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Name'), 'Utah cluster');
    await user.click(screen.getByRole('button', { name: 'Save host' }));

    await waitFor(() =>
      expect(repository.createInfrastructureTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'ssh',
          label: 'Utah cluster',
          ssh: expect.objectContaining({ host: 'login.example.edu', user: 'alice', port: 2222 }),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Connect a computer' })).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole('button', { name: 'Computer: Utah cluster' })).toBeVisible();
    // The route's own sortable list also renders an assistive-tech live
    // region once it has a destination row, so this scopes past it.
    expect(repository.setInfrastructureTransportState).toHaveBeenCalledWith(
      'ssh-target',
      'connected',
    );
  });

  it('keeps same-host CLIO lifecycle controls available in browser mode', async () => {
    runtime.desktop = false;
    connection.isManagedConnection = false;
    renderServices();
    expect(await screen.findByRole('button', { name: 'Computer: Local' })).toBeVisible();
    await openComputerMenu();
    expect(screen.getByRole('option', { name: /^Add computer/u })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
