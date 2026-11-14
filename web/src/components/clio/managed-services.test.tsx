import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  mcpServer: vi.fn(),
  mcpServerInventory: vi.fn(async () => []),
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

async function openAddMenu(user = userEvent.setup()) {
  const more = await screen.findByRole('button', { name: 'More ways to add a service' });
  await waitFor(() => expect(more).toBeEnabled());
  await user.click(more);
}

describe('ManagedServices', () => {
  it('restores a server-owned operation after reloading the page', async () => {
    repository.infrastructureInventory.mockResolvedValue({
      operations: [
        {
          id: 'resumed-operation',
          target_id: 'local',
          service_id: 'notebook_server',
          action: 'start',
          state: 'running',
          progress: 'Waiting for the existing server',
        },
      ],
    });
    renderServices();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage Notebook server' }));
    expect(await screen.findByText('Waiting for the existing server')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check status' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel operation' })).toBeEnabled();
    expect(repository.runManagedServiceAction).not.toHaveBeenCalled();
  });

  it('keeps unsaved configuration out of status and stop requests', async () => {
    deployment.managedServiceCatalog.mockResolvedValue({
      facts: { os: 'linux', arch: 'x86_64', accelerator: 'none' },
      services: services.map((row) =>
        row.id === 'notebook_server'
          ? {
              ...row,
              configuration: { port: '8089' },
              configuration_fields: [
                { id: 'port', label: 'Port', placeholder: '8089', required: false },
              ],
            }
          : row,
      ),
    });
    renderServices();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage Notebook server' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Configuration' }));
    await userEvent.clear(screen.getByLabelText('Notebook server Port'));
    await userEvent.type(screen.getByLabelText('Notebook server Port'), '9999');
    await userEvent.click(screen.getByRole('tab', { name: 'Status' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check status' }));
    await waitFor(() => expect(repository.runManagedServiceAction).toHaveBeenCalled());
    expect(repository.runManagedServiceAction.mock.calls.at(-1)?.[1].configuration.port).toBe(
      '8089',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Configuration' }));
    expect(screen.getByLabelText('Notebook server Port')).toHaveValue('9999');
  });

  it('offers connection-only services separately from deployment ownership', async () => {
    const user = userEvent.setup();
    const onConnectExistingService = vi.fn();
    renderServices({ onConnectExistingService });

    await openAddMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Connect an existing service' }));

    expect(onConnectExistingService).toHaveBeenCalledOnce();
  });

  it('opens the connected MCP services from the add menu', async () => {
    const user = userEvent.setup();
    renderServices({
      connectedAgentLocation: 'Ares',
    });

    expect(screen.getByRole('button', { name: 'Install service' })).toBeVisible();
    await openAddMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'MCP services' }));
    const dialog = await screen.findByRole('dialog', { name: 'MCP services' });
    expect(within(dialog).getByRole('heading', { name: 'MCP services on Ares' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Add MCP' })).toBeVisible();
  });

  it('identifies a command-backed connection on the agent without requiring a service URL', async () => {
    const user = userEvent.setup();
    repository.mcpServers.mockResolvedValue([
      {
        id: 'mcp_ext_web',
        name: 'Web search',
        transport: 'stdio',
        status: 'ready',
        tools: ['fetch', 'search'],
        tools_count: 2,
        spec: { command: 'web-mcp', args: [] },
      },
    ]);
    renderServices({
      connectedAgentLocation: 'Ares',
    });
    await openAddMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'MCP services' }));
    repository.mcpServer.mockImplementation(async () => (await repository.mcpServers())[0]);
    await user.click(await screen.findByRole('button', { name: 'Details for Web search' }));
    const tools = await screen.findByRole('group', { name: 'Tools of Web search' });
    expect(tools).toHaveTextContent(/fetch/i);
    expect(tools).toHaveTextContent(/search/i);
    expect(screen.getByRole('heading', { name: 'MCP services on Ares' })).toBeVisible();
    expect(screen.queryByText('No service address configured')).toBeNull();
  });

  it('shows installed inventory before choosing a new runtime', async () => {
    const user = userEvent.setup();
    renderServices();
    expect(await screen.findByRole('button', { name: 'Manage Notebook server' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Set up vLLM' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Install service' }));
    await user.click(screen.getByRole('button', { name: 'Set up vLLM' }));
    expect(screen.getByRole('dialog', { name: 'Set up vLLM' })).toBeVisible();
    await user.click(screen.getByText('Advanced settings', { exact: true }));
    expect(screen.getByLabelText('vLLM Reasoning parser')).toBeVisible();
    expect(repository.runManagedServiceAction).not.toHaveBeenCalled();
    expect(deployment.managedServiceCatalog).toHaveBeenCalledTimes(1);
  });

  it('explains why a service cannot be installed on the selected target', async () => {
    deployment.managedServiceCatalog.mockResolvedValue({
      facts: {
        target: 'local',
        os: 'windows',
        arch: 'x86_64',
        accelerator: 'none',
        docker_available: false,
        docker_installed: false,
        uv_available: true,
      },
      services: services.map((service) =>
        service.id === 'notebook_server'
          ? {
              ...service,
              state: 'not_installed' as const,
              recommended_variant: '',
              variants: service.variants.map((variant) => ({
                ...variant,
                compatible: false,
                reason: 'Requires Docker.',
              })),
            }
          : service,
      ),
    });
    renderServices();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Install service' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Install service' }));
    expect(screen.getByText('Requires Docker.')).toBeVisible();
    const research = screen.getByRole('group', { name: 'Scientific services' });
    expect(within(research).getByText('Unavailable')).toBeVisible();
    expect(within(research).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an active status check and a completion result', async () => {
    let resolveStatus!: (value: {
      service_id: string;
      action: string;
      target: string;
      status: string;
      logs: string;
    }) => void;
    deployment.runManagedServiceAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStatus = resolve;
        }),
    );
    const user = userEvent.setup();
    renderServices();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage Notebook server' }));

    await user.click(await screen.findByRole('button', { name: 'Check status' }));
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();

    resolveStatus({
      service_id: 'notebook_server',
      action: 'status',
      target: 'this computer',
      status: 'ok',
      logs: 'running',
    });
    expect(await screen.findByText('Status refreshed.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check status' })).toBeEnabled();
  });

  it('sends the service id in the path only, never as an extra action body key', async () => {
    const user = userEvent.setup();
    renderServices();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage Notebook server' }));

    await user.click(await screen.findByRole('button', { name: 'Check status' }));

    await waitFor(() => expect(repository.runManagedServiceAction).toHaveBeenCalled());
    const [serviceId, body] = repository.runManagedServiceAction.mock.calls.at(-1)!;
    expect(serviceId).toBe('notebook_server');
    expect(body).not.toHaveProperty('service_id');
    expect(body).toMatchObject({ target_id: 'local', action: 'status' });
  });

  it('shows a failed service action inline on the affected service', async () => {
    deployment.runManagedServiceAction.mockRejectedValueOnce(
      new Error('Port 8090 is already in use on Ares.'),
    );
    const user = userEvent.setup();
    renderServices();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage Notebook server' }));

    await user.click(await screen.findByRole('button', { name: 'Check status' }));

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Port 8090 is already in use on Ares.');
    expect(screen.getByRole('button', { name: 'Check status' })).toBeEnabled();
  });

  it('shows the real recent log tail in a dedicated scrollable panel', async () => {
    deployment.runManagedServiceAction.mockResolvedValueOnce({
      service_id: 'notebook_server',
      action: 'logs',
      target: 'this computer',
      status: 'ok',
      logs: 'line one\nline two',
    });
    renderServices();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage Notebook server' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Logs' }));

    await waitFor(() =>
      expect(repository.runManagedServiceAction).toHaveBeenCalledWith(
        'notebook_server',
        expect.objectContaining({ action: 'logs' }),
      ),
    );

    const logs = await screen.findByLabelText('Notebook server recent logs');
    expect(screen.getByText('Recent logs on Local')).toBeVisible();
    expect(logs).toHaveTextContent('line one');
    expect(logs).toHaveTextContent('line two');
  });

  it('renders a recoverable error when target inspection fails', async () => {
    deployment.managedServiceCatalog.mockRejectedValue(new Error('Docker inspection stalled'));
    renderServices();

    expect(await screen.findByText('Could not inspect Local')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.queryByText(/No managed services on/u)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Install service' }));
    const dialog = await screen.findByRole('dialog', { name: 'Install a service' });
    expect(within(dialog).getByText('Could not inspect Local')).toBeVisible();
  });

  it('opens the installer-requested runtime directly', async () => {
    installerInfra.installerRequestedLlamaCpp.mockResolvedValue(true);
    const user = userEvent.setup();
    renderServices();

    expect(await screen.findByText('Finish setting up your local model runtime')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Install service' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Finish setup' }));

    expect(await screen.findByRole('dialog', { name: 'Set up llama.cpp' })).toBeVisible();
    // Choosing the form is not installation: the banner follows the catalog.
    expect(screen.getByText('Finish setting up your local model runtime')).toBeVisible();
  });

  it('does not show the finish-setup banner when the installer never recorded a llama.cpp request', async () => {
    installerInfra.installerRequestedLlamaCpp.mockResolvedValue(false);
    renderServices();

    await screen.findByRole('button', { name: 'Computer: Local' });
    expect(
      screen.queryByText('Finish setting up your local model runtime'),
    ).not.toBeInTheDocument();
  });

  it('does not show the finish-setup banner once llama.cpp is actually installed', async () => {
    installerInfra.installerRequestedLlamaCpp.mockResolvedValue(true);
    deployment.managedServiceCatalog.mockResolvedValue({
      facts: localServiceFacts,
      services: services.map((service) =>
        service.id === 'llama_cpp' ? { ...service, state: 'stopped' as const } : service,
      ),
    });
    renderServices();

    await screen.findByRole('button', { name: 'Computer: Local' });
    expect(
      screen.queryByText('Finish setting up your local model runtime'),
    ).not.toBeInTheDocument();
  });
});
