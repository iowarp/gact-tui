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
  sshProfiles: vi.fn(),
}));
const installerInfra = vi.hoisted(() => ({ installerRequestedLlamaCpp: vi.fn() }));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => runtime.desktop }));
vi.mock('@/tauri/infrastructure-setup', () => deployment);
vi.mock('@/lib/installer-infrastructure', () => installerInfra);
vi.mock('@/tauri/ssh-credentials', () => ({
  deleteSshPassword: vi.fn().mockResolvedValue(undefined),
  storeSshIdentity: vi.fn(),
  storeSshPassword: vi.fn().mockResolvedValue(undefined),
}));

import { ManagedServices } from './managed-services';
import type { ManagedServiceDefinition } from '@/tauri/infrastructure-setup';

const serviceLabels: Array<[ManagedServiceDefinition['id'], string]> = [
  ['vllm', 'vLLM'],
  ['llama_cpp', 'llama.cpp'],
  ['web_search', 'CLIO Web Search'],
  ['relay', 'CLIO Relay'],
];

const services = serviceLabels.map<ManagedServiceDefinition>(([id, label]) => ({
  id,
  category:
    id === 'vllm' || id === 'llama_cpp'
      ? 'model_runtime'
      : id === 'relay'
        ? 'remote_access'
        : 'scientific_service',
  label,
  description: `${label} deployment`,
  recommended_variant: `${id}-default`,
  supports_stop: id !== 'relay',
  state: id === 'web_search' ? 'running' : 'not_installed',
  connection_url: id === 'web_search' ? 'http://127.0.0.1:8089' : undefined,
  configuration_fields: [],
  variants: [
    {
      id: `${id}-default`,
      label: 'Recommended',
      version: 'pinned',
      install_type: 'container',
      artifact: `example/${id}:pinned`,
      compatible: true,
      reason: 'Compatible with target',
    },
  ],
}));

services[0].configuration_fields = [
  {
    id: 'reasoning_parser',
    label: 'Reasoning parser',
    placeholder: 'Automatic for common reasoning models',
    required: false,
    options: ['qwen3', 'deepseek_r1'],
  },
];

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
  localStorage.clear();
  runtime.desktop = true;
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
  deployment.sshProfiles.mockResolvedValue([]);
  installerInfra.installerRequestedLlamaCpp.mockResolvedValue(false);
  deployment.runManagedServiceAction.mockResolvedValue({
    service_id: 'web_search',
    action: 'status',
    target: 'this computer',
    status: 'ok',
    logs: 'running',
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ManagedServices', () => {
  it('summarizes services attached to the connected agent before deployment controls', async () => {
    renderServices({
      connectedAgentLabel: 'Ares Research',
      connectedAgentTunnel: {
        host: 'ares.cs.iit.edu',
        user: 'alice',
        remote_port: 17_800,
        key_path: '',
        profile: 'ares',
      },
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
    expect(screen.getByRole('button', { name: /Manage deployments/u })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('separates resources from an opt-in single-provider chooser', async () => {
    const user = userEvent.setup();
    renderServices();

    expect(
      await screen.findByRole('heading', { name: 'Where should this capability run?' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Scientific services' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'CLIO Web Search' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'CLIO Relay' })).not.toBeInTheDocument();
    expect(screen.getByText('Running')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'vLLM' })).not.toBeInTheDocument();

    expect(screen.getByLabelText('Runtime')).toBeDisabled();
    await user.click(screen.getByLabelText(`Manage a model runtime with ${brand.agentName}`));
    await user.click(screen.getByLabelText('Runtime'));
    await user.click(screen.getByRole('option', { name: 'vLLM' }));
    expect(screen.getByRole('heading', { name: 'vLLM' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'llama.cpp' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('vLLM Reasoning parser')).toBeVisible();
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

    expect(await screen.findByText('Not available on this target')).toBeVisible();
    expect(screen.getByText('Requires Docker.')).toHaveClass('text-destructive/90');
  });

  it('connects a running service to CLIO without repeating its state as command output', async () => {
    const user = userEvent.setup();
    const connect = vi.fn();
    renderServices({ onConnectWebSearch: connect, webSearchConnected: false });

    expect(
      await screen.findByRole('button', { name: `Connect to ${brand.agentName}` }),
    ).toBeVisible();
    expect(screen.getAllByText('Running')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: `Connect to ${brand.agentName}` }));
    expect(connect).toHaveBeenCalledWith('http://127.0.0.1:8089');
    await user.click(screen.getByRole('button', { name: 'Check status' }));
    expect(await screen.findAllByText('Running')).toHaveLength(1);
    expect(screen.getByText('Status refreshed on this computer.')).toBeVisible();
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

    expect(await screen.findByText('Connection needs attention')).toBeVisible();
    expect(screen.getByText('Web Search document conversion is not ready')).toBeVisible();
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

    await user.click(await screen.findByRole('button', { name: 'Check status' }));
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();

    resolveStatus({
      service_id: 'web_search',
      action: 'status',
      target: 'this computer',
      status: 'ok',
      logs: 'running',
    });
    expect(await screen.findByText('Status refreshed on this computer.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check status' })).toBeEnabled();
  });

  it('shows a failed service action inline on the affected service', async () => {
    deployment.runManagedServiceAction.mockRejectedValueOnce(
      new Error('Port 8090 is already in use on Ares.'),
    );
    const user = userEvent.setup();
    renderServices();

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

    await user.click(await screen.findByRole('button', { name: 'View logs' }));

    const panel = await screen.findByRole('region', { name: 'CLIO Web Search recent logs' });
    expect(panel).toHaveTextContent('Recent logs');
    expect(panel).toHaveTextContent('Last 80 lines');
    expect(panel).toHaveTextContent('line one');
    expect(panel.querySelector('pre')).toHaveClass('max-h-72', 'overflow-auto');
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

    expect(await screen.findByText('Another Web Search deployment is connected')).toBeVisible();
    const action = screen.getByRole('button', { name: `Connect to ${brand.agentName}` });
    await user.click(action);
    expect(connect).toHaveBeenCalledWith('http://127.0.0.1:8089');
  });

  it('blocks remote CLIO from connecting to a desktop-local service', async () => {
    renderServices({
      connectedAgentLabel: 'Utah CLIO',
      connectedAgentTunnel: {
        host: 'utah.example.edu',
        user: 'alice',
        remote_port: 17_800,
        key_path: '',
      },
    });

    expect(await screen.findByText('This connection would not be reachable')).toBeVisible();
    expect(screen.getByText(/Utah CLIO runs remotely/u)).toHaveClass('text-destructive/90');
    expect(screen.queryByText(`Connected to ${brand.agentName}`)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Connect to ${brand.agentName}` })).toBeDisabled();
  });

  it('connects same-host remote CLIO through loopback on that host', async () => {
    const user = userEvent.setup();
    const connect = vi.fn();
    deployment.sshProfiles.mockResolvedValue([
      { name: 'homelab', hostname: '10.0.0.102', user: 'alice' },
    ]);
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
          ? { ...service, connection_url: 'http://10.0.0.102:8089' }
          : service,
      ),
    });
    renderServices({
      connectedAgentLabel: 'Homelab CLIO',
      connectedAgentTunnel: {
        host: '10.0.0.102',
        user: 'alice',
        remote_port: 17_800,
        key_path: '',
        profile: 'homelab',
      },
      onConnectWebSearch: connect,
    });

    await user.click(screen.getByRole('radio', { name: /Remote host/u }));
    await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: /homelab/u }));
    await user.click(await screen.findByRole('button', { name: `Connect to ${brand.agentName}` }));

    expect(connect).toHaveBeenCalledWith('http://127.0.0.1:8089');
    expect(screen.queryByText('This connection would not be reachable')).not.toBeInTheDocument();
  });

  it('keeps the infrastructure view usable while target inspection is pending', () => {
    deployment.managedServiceCatalog.mockReturnValue(new Promise(() => undefined));
    renderServices();

    expect(
      screen.getByRole('heading', { name: 'Where should this capability run?' }),
    ).toBeVisible();
    expect(screen.getByText('Inspecting this computer')).toBeVisible();
  });

  it('identifies the selected SSH host while remote discovery is running', async () => {
    const user = userEvent.setup();
    deployment.sshProfiles.mockResolvedValue([{ name: 'homelab' }]);
    deployment.managedServiceCatalog.mockImplementation((input: { target: string }) =>
      input.target === 'ssh'
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

    await user.click(screen.getByRole('radio', { name: /Remote host/u }));
    await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: 'homelab' }));

    expect(await screen.findByText('Connecting to homelab')).toBeVisible();
    expect(screen.getByText(new RegExp(`existing ${brand.agentName} services`, 'u'))).toBeVisible();
  });

  it('adds a manual SSH host beside imported profiles and uses it for inspection', async () => {
    const user = userEvent.setup();
    renderServices();

    await user.click(screen.getByRole('radio', { name: /Remote host/u }));
    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
    await user.type(screen.getByLabelText('Address'), 'login.example.edu');
    await user.clear(screen.getByLabelText('Port'));
    await user.type(screen.getByLabelText('Port'), '2222');
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Name'), 'Utah cluster');
    await user.click(screen.getByRole('button', { name: 'Save host' }));

    await waitFor(() =>
      expect(deployment.managedServiceCatalog).toHaveBeenLastCalledWith({
        target: 'ssh',
        ssh_host: 'login.example.edu',
        ssh_user: 'alice',
        ssh_port: 2222,
        ssh_auth_method: 'key',
        ssh_credential_id: 'manual:alice@login.example.edu:2222',
      }),
    );
    expect(screen.getByRole('combobox', { name: 'Saved SSH host' })).toHaveTextContent(
      'Utah cluster',
    );
  });

  it('renders a recoverable error when target inspection fails', async () => {
    deployment.managedServiceCatalog.mockRejectedValue(new Error('Docker inspection stalled'));
    renderServices();

    expect(await screen.findByText('Could not inspect this computer')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('shows connection guidance without deployment controls in browser mode', () => {
    runtime.desktop = false;
    const { container } = renderServices();

    expect(screen.getByRole('heading', { name: 'Managed infrastructure' })).toBeVisible();
    expect(screen.getByText('Connection mode')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open model settings' })).toHaveAttribute(
      'href',
      '/settings/providers',
    );
    expect(container.querySelector('[data-slot="frame"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('surfaces the installer-requested llama.cpp finish-setup banner and wires it to the runtime switch', async () => {
    installerInfra.installerRequestedLlamaCpp.mockResolvedValue(true);
    const user = userEvent.setup();
    renderServices();

    expect(await screen.findByText('Finish setting up your local model runtime')).toBeVisible();
    expect(
      screen.getByLabelText(`Manage a model runtime with ${brand.agentName}`),
    ).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Finish setup' }));

    expect(screen.getByLabelText(`Manage a model runtime with ${brand.agentName}`)).toBeChecked();
    expect(await screen.findByRole('heading', { name: 'llama.cpp' })).toBeVisible();
    // The banner gates on the catalog's actual install state, not the
    // managedProvidersEnabled switch just toggled above — llama.cpp is still
    // "not_installed" in the mocked catalog, so it must still be showing.
    // (Gating on that transient switch instead was the bug: it made the
    // banner reappear on every visit, forever, regardless of whether the
    // user had ever actually installed anything.)
    expect(screen.getByText('Finish setting up your local model runtime')).toBeVisible();
  });

  it('does not show the finish-setup banner when the installer never recorded a llama.cpp request', async () => {
    installerInfra.installerRequestedLlamaCpp.mockResolvedValue(false);
    renderServices();

    await screen.findByRole('heading', { name: 'Where should this capability run?' });
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

    await screen.findByRole('heading', { name: 'Where should this capability run?' });
    expect(
      screen.queryByText('Finish setting up your local model runtime'),
    ).not.toBeInTheDocument();
  });
});
