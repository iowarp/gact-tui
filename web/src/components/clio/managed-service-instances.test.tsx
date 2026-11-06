import { managedServiceDefinitionSchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  managedServiceCatalog: vi.fn(),
  runManagedServiceAction: vi.fn(),
  infrastructureOperation: vi.fn(),
  infrastructureOperationEvents: vi.fn(async function* () {}),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => true }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(vi.fn()) }));
vi.mock('@/tauri/ssh-profiles', () => ({
  listSshProfiles: vi.fn().mockResolvedValue([]),
  saveSshProfile: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({ useConnectionSettings: () => connection }));
vi.mock('@/tauri/ssh-infrastructure-transport', () => ({
  attachInfrastructureSshTransport: vi.fn(),
  sshTransportStatus: vi.fn(),
  writeSshTransport: vi.fn(),
}));
vi.mock('@/lib/installer-infrastructure', () => ({
  installerRequestedLlamaCpp: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/tauri/ssh-credentials', () => ({
  deleteSshPassword: vi.fn(),
  storeSshIdentity: vi.fn(),
  storeSshPassword: vi.fn(),
}));

import { ManagedServices } from './managed-services';

const facts = {
  target_id: 'local',
  label: 'Local',
  os: 'linux',
  arch: 'x86_64',
  accelerator: 'cuda',
  docker_available: true,
  docker_installed: true,
  uv_available: true,
  transport_state: 'connected',
  container_runtimes: [],
  gpus: [0, 1, 2, 3].map((index) => ({
    index,
    name: 'A100-SXM4-40GB',
    vendor: 'nvidia',
    memory_total_mib: 40960,
    uuid: `GPU-${index}`,
  })),
};

const vllm = (overrides: Record<string, unknown> = {}) =>
  managedServiceDefinitionSchema.parse({
    id: 'vllm',
    category: 'model_runtime',
    label: 'vLLM',
    description: 'Model serving.',
    recommended_variant: 'cuda',
    variants: [
      {
        id: 'cuda',
        label: 'NVIDIA CUDA',
        version: '0.28.0',
        install_type: 'container',
        artifact: 'img',
        compatible: true,
        reason: '',
      },
    ],
    configuration_fields: [
      { id: 'model', label: 'Model', placeholder: 'Qwen/Qwen3-8B', required: true },
    ],
    supports_stop: true,
    supports_instances: true,
    state: 'running',
    configuration: { model: 'Qwen/Qwen3-8B', 'param.cuda_devices': '0' },
    parameters: [
      {
        id: 'tensor_parallel_size',
        label: 'Tensor parallel size',
        description: 'Split each layer across this many devices.',
        kind: 'integer',
        delivery: 'flag',
        name: '--tensor-parallel-size',
        default_behavior: '1',
      },
      {
        id: 'cuda_devices',
        label: 'NVIDIA GPU devices',
        description: 'CUDA devices the server may use.',
        kind: 'text',
        delivery: 'env',
        name: 'CUDA_VISIBLE_DEVICES',
        variants: ['cuda'],
      },
    ],
    ...overrides,
  });

const spotter = () =>
  vllm({
    id: 'vllm@spotter',
    instance_of: 'vllm',
    instance_name: 'spotter',
    supports_instances: false,
    configuration: { model: 'Qwen/Qwen3-0.6B', 'param.cuda_devices': '1' },
  });

function renderServices() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ManagedServices />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  repository.workspaces.mockResolvedValue([]);
  repository.mcpServers.mockResolvedValue([]);
  repository.savedMcpServices.mockResolvedValue([]);
  repository.tools.mockResolvedValue([]);
  repository.infrastructureInventory.mockResolvedValue({ operations: [] });
  repository.infrastructureTargets.mockResolvedValue([
    {
      id: 'local',
      label: 'Local',
      kind: 'local',
      install_root: '',
      transport_state: 'connected',
      auto_reconnect: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]);
  repository.managedServiceCatalog.mockResolvedValue({ facts, services: [vllm(), spotter()] });
  repository.runManagedServiceAction.mockImplementation(async (serviceId, input) => ({
    id: 'op-1',
    service_id: serviceId,
    target_id: input.target_id,
    action: input.action,
    state: 'succeeded',
    progress: 'Completed',
    logs: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('named model-service instances', () => {
  it('labels instance rows and shows each deployment’s GPUs', async () => {
    renderServices();

    expect(await screen.findByRole('button', { name: 'vLLM · spotter' })).toBeInTheDocument();
    expect(screen.getByText('GPU 0')).toBeInTheDocument();
    expect(screen.getByText('GPU 1')).toBeInTheDocument();
    // Only the engine offers further instances; an instance row does not.
    expect(screen.getByRole('button', { name: 'Add vLLM instance' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add vLLM · spotter instance' })).toBeNull();
  });

  it('names a new instance, then installs it on the chosen GPUs as <engine>@<name>', async () => {
    const user = userEvent.setup();
    renderServices();

    await user.click(await screen.findByRole('button', { name: 'Add vLLM instance' }));
    const form = screen.getByRole('form', { name: 'Add vLLM instance' });
    const name = within(form).getByLabelText('Instance name');

    await user.type(name, 'Judge');
    expect(within(form).getByRole('alert')).toHaveTextContent('lowercase letters');
    await user.clear(name);
    await user.type(name, 'spotter');
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'An instance named spotter already exists.',
    );
    await user.click(within(form).getByRole('button', { name: 'Continue' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.clear(name);
    await user.type(name, 'judge');
    expect(within(form).getByText('Deploys as vllm@judge')).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Continue' }));

    const dialog = await screen.findByRole('dialog', { name: 'Set up vLLM · judge' });
    await user.type(within(dialog).getByLabelText('vLLM · judge Model'), 'Qwen/Qwen3-8B');
    await user.click(within(dialog).getByText('Advanced settings'));
    const gpus = within(dialog).getByRole('group', { name: 'vLLM · judge NVIDIA GPU devices' });
    expect(within(gpus).getByRole('checkbox', { name: 'All GPUs' })).toBeChecked();
    await user.click(within(gpus).getByRole('checkbox', { name: /^GPU 2 ·/u }));
    await user.click(within(gpus).getByRole('checkbox', { name: /^GPU 3 ·/u }));
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    await waitFor(() => expect(repository.runManagedServiceAction).toHaveBeenCalled());
    const [serviceId, body] = repository.runManagedServiceAction.mock.calls.at(-1)!;
    expect(serviceId).toBe('vllm@judge');
    expect(body).toMatchObject({
      target_id: 'local',
      action: 'install',
      variant_id: 'cuda',
      configuration: {
        model: 'Qwen/Qwen3-8B',
        'param.cuda_devices': '2,3',
        'param.tensor_parallel_size': '2',
      },
    });
    expect(body).not.toHaveProperty('service_id');
  });

  it('shows the server’s refusal of a GPU choice', async () => {
    repository.runManagedServiceAction.mockRejectedValueOnce(
      new Error('GPU 1 is already fully allocated to vllm@spotter.'),
    );
    const user = userEvent.setup();
    renderServices();

    await user.click(await screen.findByRole('button', { name: 'Add vLLM instance' }));
    await user.type(screen.getByLabelText('Instance name'), 'judge');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const dialog = await screen.findByRole('dialog', { name: 'Set up vLLM · judge' });
    await user.type(within(dialog).getByLabelText('vLLM · judge Model'), 'Qwen/Qwen3-8B');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'GPU 1 is already fully allocated to vllm@spotter.',
    );
  });

  it('keeps today’s controls when the computer reports no GPUs or instances', async () => {
    repository.managedServiceCatalog.mockResolvedValue({
      facts: { ...facts, gpus: undefined },
      services: [vllm({ supports_instances: undefined })],
    });
    renderServices();

    expect(await screen.findByRole('button', { name: 'Manage vLLM' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add vLLM instance' })).toBeNull();
    expect(screen.getByText('GPU 0')).toBeInTheDocument();
  });
});
