import {
  contextControlsSchema,
  managedServiceDefinitionSchema,
  type ContextControls,
  type ManagedServiceDefinition,
} from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  previewContextSizing: vi.fn(),
  workingContext: vi.fn(),
  saveWorkingContext: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:17800' } }),
}));

import { ManagedServiceContextControl } from './managed-service-context';
import { ServerParametersForm } from './managed-service-parameters';
import { SettingsWorkingContext } from './settings-working-context';

const strategies = [{ id: 'fit_to_gpu', label: 'Largest that fits', description: '' }];

const controls = (overrides: Record<string, unknown> = {}): ContextControls =>
  contextControlsSchema.parse({
    semantics: 'deployment',
    maximum: 131_072,
    maximum_reason: 'config.json',
    minimum: 256,
    current: 65_536,
    current_choice: 'fit_to_gpu',
    current_reason: 'KV cache fits in 0.9 of 1 GPU',
    fit_to_gpu: { available: true, strategy: 'fit_to_gpu', strategies, value: 65_536 },
    ...overrides,
  });

const vllm = (fitAvailable: boolean, configuration: Record<string, string> = {}) =>
  managedServiceDefinitionSchema.parse({
    id: 'vllm',
    category: 'model_runtime',
    label: 'vLLM',
    description: 'Serving',
    recommended_variant: 'cuda',
    variants: [
      {
        id: 'cuda',
        label: 'CUDA',
        version: '1',
        install_type: 'container',
        artifact: 'img',
        compatible: true,
        reason: '',
      },
    ],
    supports_stop: true,
    state: configuration['effective.context_length'] ? 'running' : 'not_installed',
    configuration,
    parameters: [
      {
        id: 'max_model_len',
        label: 'Context length',
        description: 'Maximum sequence length',
        kind: 'integer',
        delivery: 'flag',
        name: '--max-model-len',
        minimum: 16,
        maximum: 10_000_000,
        default_behavior: 'Fit to GPU: the model’s maximum, capped to fit the GPU',
        context_sizing: {
          strategies,
          default_strategy: 'fit_to_gpu',
          fit_to_gpu_available: fitAvailable,
          fit_to_gpu_reason: fitAvailable ? '' : 'No GPU on this host',
        },
      },
      {
        id: 'gpu_memory_utilization',
        label: 'GPU memory share',
        description: 'Share',
        kind: 'number',
        delivery: 'flag',
        name: '--gpu-memory-utilization',
      },
    ],
  });

function Form({
  service,
  initial,
}: {
  service: ManagedServiceDefinition;
  initial: Record<string, string>;
}) {
  const [configuration, setConfiguration] = useState(initial);
  return (
    <>
      <ManagedServiceContextControl
        configuration={configuration}
        onConfiguration={(key, value) =>
          setConfiguration((current) => ({ ...current, [key]: value }))
        }
        service={service}
        targetId="local"
        variant="cuda"
      />
      <ServerParametersForm
        onChange={() => undefined}
        parameters={service.parameters}
        serviceLabel="vLLM"
        values={configuration}
        variant="cuda"
      />
      <output data-testid="configuration">{JSON.stringify(configuration)}</output>
    </>
  );
}

const renderWithQuery = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );

beforeEach(() => {
  repository.previewContextSizing.mockReset();
  repository.workingContext.mockReset();
  repository.saveWorkingContext.mockReset();
});
afterEach(cleanup);

describe('ManagedServiceContextControl', () => {
  it('previews the model on its host and offers Fit to GPU strategies', async () => {
    repository.previewContextSizing.mockResolvedValue(controls());
    renderWithQuery(<Form initial={{ model: 'Qwen/Qwen3-4B' }} service={vllm(true)} />);
    await waitFor(() => expect(repository.previewContextSizing).toHaveBeenCalled(), {
      timeout: 2000,
    });
    const [serviceId, input] = repository.previewContextSizing.mock.calls[0] as [
      string,
      { target_id: string; variant_id: string; configuration: Record<string, string> },
    ];
    expect(serviceId).toBe('vllm');
    expect(input).toMatchObject({ target_id: 'local', variant_id: 'cuda' });
    expect(input.configuration.model).toBe('Qwen/Qwen3-4B');
    expect(await screen.findByRole('combobox', { name: 'Fit to GPU' })).toBeVisible();
    expect(screen.getByText(/Default: 65,536 tokens · KV cache fits/u)).toBeVisible();
    // The context parameter is not duplicated among the plain server parameters.
    expect(screen.queryByRole('spinbutton', { name: 'vLLM Context length' })).toBeNull();
    expect(screen.getByLabelText('vLLM GPU memory share')).toBeInTheDocument();
  });

  it('hides Fit to GPU when the host cannot compute it; Max writes the context keys', async () => {
    const user = userEvent.setup();
    repository.previewContextSizing.mockResolvedValue(
      controls({ fit_to_gpu: { available: false, reason: 'No GPU', strategies } }),
    );
    renderWithQuery(<Form initial={{ model: 'Qwen/Qwen3-4B' }} service={vllm(false)} />);
    await waitFor(() => expect(repository.previewContextSizing).toHaveBeenCalled(), {
      timeout: 2000,
    });
    expect(screen.queryByRole('combobox', { name: 'Fit to GPU' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Max' }));
    expect(JSON.parse(screen.getByTestId('configuration').textContent ?? '{}')).toMatchObject({
      'context.choice': 'max',
      'param.max_model_len': '',
    });
    expect(screen.getByLabelText('Context length')).toHaveValue(131_072);
  });

  it('shows the effective context and reason of an installed deployment', () => {
    renderWithQuery(
      <Form
        initial={{}}
        service={vllm(true, {
          'effective.context_length': '32768',
          'effective.context_reason': 'Fit to GPU: 0.9 of 1 GPU',
        })}
      />,
    );
    expect(screen.getByText(/In force: 32,768 tokens/u)).toBeVisible();
    expect(screen.getByText(/Fit to GPU: 0.9 of 1 GPU/u)).toBeVisible();
    expect(repository.previewContextSizing).not.toHaveBeenCalled();
  });

  it('renders nothing for an engine without the sizing control', () => {
    const service = managedServiceDefinitionSchema.parse({
      ...vllm(true),
      parameters: [],
    });
    renderWithQuery(<Form initial={{}} service={service} />);
    expect(screen.queryByLabelText('Context length')).toBeNull();
  });
});

describe('SettingsWorkingContext', () => {
  it('saves a bounded working context for a bound model', async () => {
    const user = userEvent.setup();
    const seed = controls({
      semantics: 'model',
      maximum: 200_000,
      current: 200_000,
      current_choice: 'max',
      current_reason: 'the model’s maximum',
      fit_to_gpu: { available: false, reason: 'Not run by this service', strategies },
    });
    repository.workingContext.mockResolvedValue(seed);
    repository.saveWorkingContext.mockResolvedValue({
      ...seed,
      current: 64_000,
      current_choice: 'number',
      current_reason: 'set in Settings',
    });
    renderWithQuery(
      <SettingsWorkingContext modelId="claude-x" providerId="anthropic" seed={seed} />,
    );
    expect(screen.queryByRole('combobox', { name: 'Fit to GPU' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    const input = screen.getByLabelText('Context length');
    await user.clear(input);
    await user.type(input, '300000');
    expect(screen.getByRole('alert')).toHaveTextContent('At most 200,000 tokens');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(input);
    await user.type(input, '64000');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(repository.saveWorkingContext).toHaveBeenCalledWith('anthropic', {
      model: 'claude-x',
      choice: 'number',
      tokens: 64_000,
    });
    expect(await screen.findByText(/In force: 64,000 tokens/u)).toBeVisible();
  });
});
