import { brand } from '@brand';
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
import { services } from '@/test-fixtures/managed-services';

function renderServices(props: ComponentProps<typeof ManagedServices> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ManagedServices {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  repository.infrastructureInventory.mockResolvedValue({ operations: [] });
  localStorage.clear();
  runtime.desktop = true;
  connection.isManagedConnection = true;
  deployment.managedServiceCatalog.mockResolvedValue({
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
    service_id: 'web_search',
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
    service_id: 'web_search',
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

describe('ManagedServices', () => {
  it('lets a browser select an already registered remote host without creating a Desktop transport', async () => {
    runtime.desktop = false;
    repository.infrastructureTargets.mockResolvedValue([
      { id: 'local', label: 'Local', kind: 'local', transport_state: 'connected' },
      {
        id: 'homelab',
        label: 'Homelab',
        kind: 'ssh',
        transport_state: 'connected',
        ssh: { profile: 'homelab' },
      },
    ]);
    renderServices();
    await userEvent.click(screen.getByText(/Execution host ·/u));
    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Registered execution host' }),
    );
    await userEvent.click(screen.getByRole('option', { name: 'Homelab · Connected' }));
    await waitFor(() =>
      expect(repository.managedServiceCatalog).toHaveBeenCalledWith(
        'homelab',
        expect.any(AbortSignal),
      ),
    );
    expect(repository.createInfrastructureTarget).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox', { name: 'Saved SSH host' })).not.toBeInTheDocument();
  });
  it('restores a server-owned operation after reloading the page', async () => {
    repository.infrastructureInventory.mockResolvedValue({
      operations: [
        {
          id: 'resumed-operation',
          target_id: 'local',
          service_id: 'web_search',
          action: 'start',
          state: 'running',
          progress: 'Waiting for the existing server',
        },
      ],
    });
    renderServices();
    await userEvent.click(
      await screen.findByRole('button', { name: `Manage ${vocab.agent} Web Search` }),
    );
    expect(await screen.findByText('Waiting for the existing server')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check status' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel operation' })).toBeEnabled();
    expect(repository.runManagedServiceAction).not.toHaveBeenCalled();
  });

  it('keeps unsaved configuration out of status and stop requests', async () => {
    deployment.managedServiceCatalog.mockResolvedValue({
      facts: { os: 'linux', arch: 'x86_64', accelerator: 'none' },
      services: services.map((row) =>
        row.id === 'web_search'
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
    await userEvent.click(
      await screen.findByRole('button', { name: `Manage ${vocab.agent} Web Search` }),
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Configuration' }));
    await userEvent.clear(screen.getByLabelText(`${vocab.agent} Web Search Port`));
    await userEvent.type(screen.getByLabelText(`${vocab.agent} Web Search Port`), '9999');
    await userEvent.click(screen.getByRole('tab', { name: 'Status' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check status' }));
    await waitFor(() => expect(repository.runManagedServiceAction).toHaveBeenCalled());
    expect(repository.runManagedServiceAction.mock.calls.at(-1)?.[1].configuration.port).toBe(
      '8089',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Configuration' }));
    expect(screen.getByLabelText(`${vocab.agent} Web Search Port`)).toHaveValue('9999');
  });

  it('offers connection-only services separately from deployment ownership', async () => {
    const user = userEvent.setup();
    const onConnectExistingService = vi.fn();
    renderServices({ onConnectExistingService });

    await user.click(screen.getByRole('button', { name: 'Connect existing service…' }));

    expect(onConnectExistingService).toHaveBeenCalledOnce();
  });

  it('summarizes services attached to the connected agent before deployment controls', async () => {
    renderServices({
      connectedAgentLabel: 'Ares Research',
      connectedAgentLocation: 'Ares',
      relayStatus: {
        configured: true,
        host: 'relay.lab.example',
        mcp_url: 'https://relay.lab.example/mcp',
        reachable: true,
        details: {},
      },
      webSearchConnected: true,
      webSearchConnection: {
        name: 'web',
        configured: true,
        scope: 'user',
        status: 'ready',
        tools_count: 3,
        tools: ['fetch', 'fetch_events', 'search'],
        retryable: false,
        spec: {
          args: ['mcp-server', 'web', '--remote-url', 'http://127.0.0.1:8089'],
        },
      },
    });

    expect(screen.getByRole('heading', { name: 'Ares › Research' })).toBeVisible();
    expect(screen.getByText('http://127.0.0.1:8089')).toBeVisible();
    expect(screen.getByText('Runs on Ares')).toBeVisible();
    expect(screen.getByText('Runs on relay.lab.example')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Deploy new' })).toBeVisible();
  });

  it('shows installed inventory before choosing a new runtime', async () => {
    const user = userEvent.setup();
    renderServices();
    expect(
      await screen.findByRole('button', { name: `Manage ${vocab.agent} Web Search` }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'vLLM' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Deploy new' }));
    await user.click(screen.getByRole('button', { name: 'Set up vLLM' }));
    expect(screen.getByRole('heading', { name: 'vLLM' })).toBeVisible();
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
        service.id === 'web_search'
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

    await waitFor(() => expect(screen.getByRole('button', { name: 'Deploy new' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Deploy new' }));
    await userEvent.click(
      screen.getByRole('button', { name: `Review ${vocab.agent} Web Search requirements` }),
    );
    expect(screen.getByText(/Not available on this target. Requires Docker./u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('connects a running service to CLIO without repeating its state as command output', async () => {
    const user = userEvent.setup();
    const connect = vi.fn();
    renderServices({ onConnectWebSearch: connect, webSearchConnected: false });
    await userEvent.click(
      await screen.findByRole('button', { name: `Manage ${vocab.agent} Web Search` }),
    );

    expect(
      await screen.findByRole('button', { name: `Connect to ${brand.agentName}` }),
    ).toBeVisible();
    expect(
      screen.getByRole('article', { name: `${vocab.agent} Web Search management` }),
    ).toHaveTextContent('Running');
    await user.click(screen.getByRole('button', { name: `Connect to ${brand.agentName}` }));
    expect(connect).toHaveBeenCalledWith('http://127.0.0.1:8089');
    await user.click(screen.getByRole('button', { name: 'Check status' }));
    expect(
      screen.getByRole('article', { name: `${vocab.agent} Web Search management` }),
    ).toHaveTextContent('Running');
    expect(screen.getByText('Status refreshed.')).toBeVisible();
    expect(screen.queryByText('running')).not.toBeInTheDocument();
  });

  it('disconnects the selected Web Search deployment instead of routing to tools', async () => {
    const user = userEvent.setup();
    const disconnect = vi.fn();
    renderServices({
      onDisconnectWebSearch: disconnect,
      webSearchConnected: true,
      webSearchConnection: {
        name: 'web',
        configured: true,
        scope: 'user',
        status: 'ready',
        transport: 'stdio',
        tools_count: 3,
        tools: ['search', 'fetch', 'fetch_events'],
        spec: {
          args: ['mcp-server', 'web', '--remote-url', 'http://127.0.0.1:8089'],
        },
        retryable: false,
      },
    });
    await userEvent.click(
      await screen.findByRole('button', { name: `Manage ${vocab.agent} Web Search` }),
    );

    const action = await screen.findByRole('button', { name: 'Disconnect' });
    expect(screen.queryByRole('link', { name: 'View tools' })).not.toBeInTheDocument();
    await user.click(action);

    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('does not call a matching but degraded Web Search configuration connected', async () => {
    renderServices({
      webSearchConnected: false,
      webSearchConnection: {
        name: 'web',
        configured: true,
        scope: 'user',
        status: 'degraded',
        transport: 'stdio',
        tools_count: 0,
        tools: [],
        spec: {
          args: ['mcp-server', 'web', '--remote-url', 'http://127.0.0.1:8089'],
        },
        retryable: true,
        error: 'Web Search document conversion is not ready',
      },
    });
    await userEvent.click(
      await screen.findByRole('button', { name: `Manage ${vocab.agent} Web Search` }),
    );

    expect(await screen.findByText('Connection needs attention')).toBeVisible();
    expect(
      within(screen.getByRole('dialog')).getByText('Web Search document conversion is not ready'),
    ).toBeVisible();
    expect(screen.queryByText(`Connected to ${brand.agentName}`)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Connect to ${brand.agentName}` })).toBeVisible();
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
    await userEvent.click(
      await screen.findByRole('button', { name: `Manage ${vocab.agent} Web Search` }),
    );

    await user.click(await screen.findByRole('button', { name: 'Check status' }));
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();

    resolveStatus({
      service_id: 'web_search',
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
    await userEvent.click(
      await screen.findByRole('button', { name: `Manage ${vocab.agent} Web Search` }),
    );

    await user.click(await screen.findByRole('button', { name: 'Check status' }));

    await waitFor(() => expect(repository.runManagedServiceAction).toHaveBeenCalled());
    const [serviceId, body] = repository.runManagedServiceAction.mock.calls.at(-1)!;
    expect(serviceId).toBe('web_search');
    expect(body).not.toHaveProperty('service_id');
    expect(body).toMatchObject({ target_id: 'local', action: 'status' });
  });

  it('shows a failed service action inline on the affected service', async () => {
    deployment.runManagedServiceAction.mockRejectedValueOnce(
      new Error('Port 8090 is already in use on Ares.'),
    );
    const user = userEvent.setup();
    renderServices();
    await userEvent.click(
      await screen.findByRole('button', { name: `Manage ${vocab.agent} Web Search` }),
    );

    await user.click(await screen.findByRole('button', { name: 'Check status' }));

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Port 8090 is already in use on Ares.');
    expect(screen.getByRole('button', { name: 'Check status' })).toBeEnabled();
  });

  it('shows the real recent log tail in a dedicated scrollable panel', async () => {
    deployment.runManagedServiceAction.mockResolvedValueOnce({
      service_id: 'web_search',
      action: 'logs',
      target: 'this computer',
      status: 'ok',
      logs: 'line one\nline two',
    });
    const user = userEvent.setup();
    renderServices();
    await userEvent.click(
      await screen.findByRole('button', { name: `Manage ${vocab.agent} Web Search` }),
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Logs' }));

    await user.click(await screen.findByRole('button', { name: 'View logs' }));

    const panel = await screen.findByRole('region', {
      name: `${vocab.agent} Web Search recent logs`,
    });
    expect(panel).toHaveTextContent('Recent logs');
    expect(panel).toHaveTextContent('line one');
    expect(panel.querySelector('pre')).toHaveClass('max-h-80', 'overflow-auto');
  });

  it('does not claim a selected deployment is connected when CLIO points elsewhere', async () => {
    const connect = vi.fn();
    const user = userEvent.setup();
    renderServices({
      onConnectWebSearch: connect,
      webSearchConnected: true,
      webSearchConnection: {
        name: 'web',
        configured: true,
        scope: 'user',
        status: 'ready',
        transport: 'stdio',
        tools_count: 3,
        tools: ['search', 'fetch', 'fetch_events'],
        spec: {
          args: ['mcp-server', 'web', '--remote-url', 'http://10.0.0.102:8089'],
        },
        retryable: false,
      },
    });
    await userEvent.click(
      await screen.findByRole('button', { name: `Manage ${vocab.agent} Web Search` }),
    );

    expect(await screen.findByText('Another Web Search deployment is connected')).toBeVisible();
    const action = screen.getByRole('button', { name: `Connect to ${brand.agentName}` });
    await user.click(action);
    expect(connect).toHaveBeenCalledWith('http://127.0.0.1:8089');
  });

  it('limits a remote CLIO to lifecycle management on its own computer', async () => {
    connection.isManagedConnection = false;
    renderServices({
      connectedAgentLabel: 'Utah CLIO',
      connectedAgentLocation: 'Utah',
    });
    await userEvent.click(screen.getByText(/Execution host ·/u));

    expect(
      await screen.findByRole('radio', {
        name: new RegExp(`This ${brand.agentName}’s computer`, 'u'),
      }),
    ).toBeVisible();
    expect(screen.queryByRole('radio', { name: /Another computer/u })).not.toBeInTheDocument();
    expect(screen.queryByText('This connection would not be reachable')).not.toBeInTheDocument();
  });

  it('uses the endpoint reported by remote CLIO for a same-host service', async () => {
    const user = userEvent.setup();
    const connect = vi.fn();
    connection.isManagedConnection = false;
    deployment.managedServiceCatalog.mockResolvedValue({
      facts: {
        target: 'homelab',
        os: 'linux',
        arch: 'x86_64',
        accelerator: 'none',
        docker_available: true,
        docker_installed: true,
        uv_available: true,
      },
      services: services.map((service) =>
        service.id === 'web_search'
          ? { ...service, connection_url: 'http://127.0.0.1:8089' }
          : service,
      ),
    });
    renderServices({
      connectedAgentLabel: 'Homelab CLIO',
      connectedAgentLocation: 'Homelab',
      onConnectWebSearch: connect,
    });
    await userEvent.click(
      await screen.findByRole('button', { name: `Manage ${vocab.agent} Web Search` }),
    );

    await user.click(await screen.findByRole('button', { name: `Connect to ${brand.agentName}` }));

    expect(connect).toHaveBeenCalledWith('http://127.0.0.1:8089');
    expect(screen.queryByText('This connection would not be reachable')).not.toBeInTheDocument();
  });

  it('keeps the infrastructure view usable while target inspection is pending', () => {
    deployment.managedServiceCatalog.mockReturnValue(new Promise(() => undefined));
    renderServices();

    expect(screen.getByText(/Execution host ·/u)).toBeVisible();
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
    await userEvent.click(screen.getByText(/Execution host ·/u));

    await user.click(screen.getByRole('radio', { name: /Another computer/u }));
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
    await userEvent.click(screen.getByText(/Execution host ·/u));

    await user.click(screen.getByRole('radio', { name: /Another computer/u }));
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
    renderServices();
    await userEvent.click(screen.getByText(/Execution host ·/u));

    await user.click(screen.getByRole('radio', { name: /Another computer/u }));
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
    expect(screen.getByRole('combobox', { name: 'Saved SSH host' })).toHaveTextContent(
      'Utah cluster',
    );
    // The route's own sortable list also renders an assistive-tech live
    // region once it has a destination row, so this scopes past it.
    expect(screen.getByText('Connected', { selector: '[role="status"]' })).toBeVisible();
  });

  it('renders a recoverable error when target inspection fails', async () => {
    deployment.managedServiceCatalog.mockRejectedValue(new Error('Docker inspection stalled'));
    renderServices();

    expect(await screen.findByText('Could not inspect this computer')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('keeps same-host CLIO lifecycle controls available in browser mode', async () => {
    runtime.desktop = false;
    connection.isManagedConnection = false;
    renderServices();
    await userEvent.click(screen.getByText(/Execution host ·/u));

    expect(await screen.findByText(/Execution host ·/u)).toBeVisible();
    expect(
      screen.getByRole('radio', { name: new RegExp(`This ${brand.agentName}’s computer`, 'u') }),
    ).toBeVisible();
    expect(screen.queryByRole('radio', { name: /Another computer/u })).not.toBeInTheDocument();
  });

  it('opens the installer-requested runtime directly', async () => {
    installerInfra.installerRequestedLlamaCpp.mockResolvedValue(true);
    const user = userEvent.setup();
    renderServices();

    expect(await screen.findByText('Finish setting up your local model runtime')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Deploy new' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Finish setup' }));

    expect(await screen.findByRole('heading', { name: 'llama.cpp' })).toBeVisible();
    // Choosing the form is not installation: the banner follows the catalog.
    expect(screen.getByText('Finish setting up your local model runtime')).toBeVisible();
  });

  it('does not show the finish-setup banner when the installer never recorded a llama.cpp request', async () => {
    installerInfra.installerRequestedLlamaCpp.mockResolvedValue(false);
    renderServices();

    await screen.findByText(/Execution host ·/u);
    expect(
      screen.queryByText('Finish setting up your local model runtime'),
    ).not.toBeInTheDocument();
  });

  it('does not show the finish-setup banner once llama.cpp is actually installed', async () => {
    installerInfra.installerRequestedLlamaCpp.mockResolvedValue(true);
    deployment.managedServiceCatalog.mockResolvedValue({
      facts: {
        target: 'local',
        os: 'windows',
        arch: 'x86_64',
        accelerator: 'none',
        docker_available: true,
        docker_installed: true,
        uv_available: true,
      },
      services: services.map((service) =>
        service.id === 'llama_cpp' ? { ...service, state: 'stopped' as const } : service,
      ),
    });
    renderServices();

    await screen.findByText(/Execution host ·/u);
    expect(
      screen.queryByText('Finish setting up your local model runtime'),
    ).not.toBeInTheDocument();
  });
});
import { vocab } from '@/lib/brand-vocabulary';
