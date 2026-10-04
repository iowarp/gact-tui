import type { ManagedServiceDefinition, ServerParameter } from '@clio/core/v3';
import { managedServiceDefinitionSchema } from '@clio/core/v3';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManagedServiceCard } from './managed-service-card';
import { configurationForVariant, modelRuntimeInModels } from './managed-service-target-utils';

afterEach(cleanup);

const parameter = (
  row: Partial<ServerParameter> & Pick<ServerParameter, 'id' | 'label' | 'name'>,
) =>
  ({
    description: `${row.label} description`,
    kind: 'integer',
    delivery: 'flag',
    options: [],
    variants: [],
    default_behavior: 'Engine default',
    effective_key: row.id,
    ...row,
  }) as ServerParameter;

// Parsed through the real wire schema, the way the repository hands it to the UI.
const vllm = (overrides: Record<string, unknown> = {}): ManagedServiceDefinition =>
  managedServiceDefinitionSchema.parse({
    id: 'vllm',
    category: 'model_runtime',
    label: 'vLLM',
    description: 'OpenAI-compatible model serving.',
    recommended_variant: 'cpu',
    variants: [
      {
        id: 'cpu',
        label: 'CPU',
        version: '0.28.0',
        install_type: 'container',
        artifact: 'img',
        compatible: true,
        reason: '',
      },
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
      { id: 'model', label: 'Model', placeholder: 'Qwen/Qwen3-8B', required: true, options: [] },
      {
        id: 'container_runtime',
        label: 'Container runtime',
        placeholder: 'Automatic (Docker)',
        required: false,
        options: ['docker', 'podman'],
      },
    ],
    supports_stop: true,
    state: 'not_installed',
    parameters: [
      parameter({ id: 'max_num_seqs', label: 'Concurrent sequences', name: '--max-num-seqs' }),
      parameter({
        id: 'gpu_memory_utilization',
        label: 'GPU memory fraction',
        name: '--gpu-memory-utilization',
        kind: 'number',
        variants: ['cuda', 'rocm'],
      }),
      parameter({
        id: 'cpu_kvcache_space',
        label: 'KV cache memory (GiB)',
        name: 'VLLM_CPU_KVCACHE_SPACE',
        delivery: 'env',
        variants: ['cpu'],
      }),
    ],
    ...overrides,
  });

function renderCard(
  service: ManagedServiceDefinition,
  variant = 'cpu',
  configuration: Record<string, string> = {},
) {
  const onConfiguration = vi.fn();
  const onAction = vi.fn();
  render(
    <MemoryRouter>
      <ManagedServiceCard
        configuration={configuration}
        onAction={onAction}
        onConfiguration={onConfiguration}
        onVariant={vi.fn()}
        service={service}
        variant={variant}
      />
    </MemoryRouter>,
  );
  return { onAction, onConfiguration };
}

describe('model runtime server parameters', () => {
  it('renders only the parameters of the chosen variant and writes param.<id> keys', async () => {
    const user = userEvent.setup();
    const { onConfiguration } = renderCard(vllm(), 'cpu');

    await user.click(screen.getByText('Server parameters'));

    expect(screen.getByLabelText('vLLM Concurrent sequences')).toBeInTheDocument();
    expect(screen.getByLabelText('vLLM KV cache memory (GiB)')).toBeInTheDocument();
    expect(screen.queryByLabelText('vLLM GPU memory fraction')).not.toBeInTheDocument();
    expect(screen.getByText('VLLM_CPU_KVCACHE_SPACE')).toBeInTheDocument();

    await user.type(screen.getByLabelText('vLLM Concurrent sequences'), '8');
    expect(onConfiguration).toHaveBeenLastCalledWith('param.max_num_seqs', '8');
  });

  it('shows the GPU memory parameter for the CUDA variant instead of the CPU one', async () => {
    const user = userEvent.setup();
    renderCard(vllm(), 'cuda');

    await user.click(screen.getByText('Server parameters'));

    expect(screen.getByLabelText('vLLM GPU memory fraction')).toBeInTheDocument();
    expect(screen.queryByLabelText('vLLM KV cache memory (GiB)')).not.toBeInTheDocument();
  });

  it('keeps install disabled until the required model is given', () => {
    renderCard(vllm());
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
    cleanup();
    renderCard(vllm(), 'cpu', { model: 'Qwen/Qwen2.5-0.5B-Instruct' });
    expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
  });

  it('shows what is in force on a running server with each value source', async () => {
    renderCard(
      vllm({
        state: 'running',
        connection_url: 'http://127.0.0.1:52011',
        effective_parameters: [
          {
            id: 'max_model_len',
            label: 'Context length',
            value: '4096',
            source: 'server_report',
            detail: 'vLLM /v1/models max_model_len',
          },
          {
            id: 'max_num_seqs',
            label: 'Concurrent sequences',
            value: '4',
            source: 'container_config',
            detail: '',
          },
          {
            id: 'tensor_parallel_size',
            label: 'Tensor parallel size',
            value: '1',
            source: 'engine_default',
            detail: '',
          },
        ],
        owned_resources: [
          { kind: 'container', ref: 'clio-vllm', runtime: 'docker', created_at: '' },
          {
            kind: 'directory',
            ref: '/home/alice/.local/share/clio/services/clio-vllm/cache',
            created_at: '',
          },
        ],
      }),
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Configuration' }));
    const inForce = screen.getByRole('region', { name: 'vLLM parameters in force' });
    expect(within(inForce).getByText('4096')).toBeInTheDocument();
    expect(within(inForce).getByText('Reported by the server')).toBeInTheDocument();
    expect(within(inForce).getByText('Container launch')).toBeInTheDocument();
    expect(within(inForce).getByText('Engine default')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Storage' }));
    expect(screen.getByText('Created on this host (2)')).toBeInTheDocument();
    expect(screen.queryByText('Server parameters')).not.toBeInTheDocument();
  });

  it('shows the operation progress CLIO reports while an install runs', () => {
    render(
      <MemoryRouter>
        <ManagedServiceCard
          activeAction="install"
          configuration={{ model: 'Qwen/Qwen2.5-0.5B-Instruct' }}
          onAction={vi.fn()}
          onConfiguration={vi.fn()}
          onVariant={vi.fn()}
          progress="Waiting for vLLM to load and answer (42s)"
          service={vllm()}
          variant="cpu"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Waiting for vLLM to load and answer (42s)',
    );
  });

  it('lets a stopped runtime start without re-entering its installed model', () => {
    renderCard(vllm({ state: 'stopped' }));
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
  });
});

describe('deployments CLIO lost track of', () => {
  it('offers uninstall for a record in no known state that still owns resources', async () => {
    renderCard(
      vllm({
        state: 'unknown',
        owned_resources: [
          { kind: 'container', ref: 'clio-vllm', runtime: 'docker', created_at: '' },
        ],
      }),
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Storage' }));
    expect(screen.getByRole('button', { name: 'Uninstall' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
    expect(screen.getByText('Created on this host (1)')).toBeInTheDocument();
  });

  it('lets a running install be cancelled', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ManagedServiceCard
          activeAction="install"
          configuration={{}}
          onAction={vi.fn()}
          onCancel={onCancel}
          onConfiguration={vi.fn()}
          onVariant={vi.fn()}
          progress="Waiting for vLLM to load and answer (10s)"
          service={vllm()}
          variant="cpu"
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel operation' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('drops parameters of another variant before sending', () => {
    const parameters = vllm().parameters;
    expect(
      configurationForVariant(
        {
          model: 'm',
          'param.gpu_memory_utilization': '0.5',
          'param.cpu_kvcache_space': '2',
          'param.max_num_seqs': '4',
        },
        parameters,
        'cpu',
      ),
    ).toEqual({ model: 'm', 'param.cpu_kvcache_space': '2', 'param.max_num_seqs': '4' });
  });
});

describe('deployment target facts', () => {
  it('recognizes a runtime already saved as its Models preset address', () => {
    const saved = [
      {
        id: 'ollama',
        preset_id: 'ollama',
        label: 'Ollama',
        address: 'http://127.0.0.1:52011/v1',
        custom: false,
      },
    ];
    expect(modelRuntimeInModels(saved as never, 'ollama', 'http://127.0.0.1:52011')).toBe(true);
    expect(modelRuntimeInModels(saved as never, 'ollama', 'http://127.0.0.1:52012')).toBe(false);
    expect(modelRuntimeInModels(saved as never, 'vllm', 'http://127.0.0.1:52011')).toBe(false);
  });
});
