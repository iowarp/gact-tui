import { managedServiceDefinitionSchema } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManagedServiceCard } from './managed-service-card';

afterEach(cleanup);

function service(phase: 'stopped' | 'not_installed') {
  return managedServiceDefinitionSchema.parse({
    id: 'vllm',
    category: 'model_runtime',
    label: 'vLLM',
    description: 'Model serving.',
    recommended_variant: 'native-cuda',
    supports_stop: true,
    variants: [
      {
        id: 'native-cuda',
        label: 'Native CUDA',
        version: '0.28.0',
        artifact: 'vllm==0.28.0',
        install_type: 'native_uv',
        compatible: true,
        reason: '',
      },
    ],
    state: phase,
    configuration: {
      model: '/data/models/qualified',
      'storage.service_directory': '/data/services/vllm',
    },
    owned_resources: [{ kind: 'directory', ref: '/data/services/vllm' }],
    observation: {
      definition_version: 'vllm-native-1',
      configuration_revision: 'sha',
      phase,
      installed: phase === 'stopped',
      running: false,
      serving: false,
      worker_alive: false,
      provenance_ingesting: false,
      attention_verified: false,
      evidence_directory: '/data/services/vllm/evidence',
      observed_at: 1,
    },
    configuration_fields: [
      { id: 'model', label: 'Model', placeholder: '/data/models/model', required: true },
      {
        id: 'container_runtime',
        label: 'Container runtime',
        placeholder: 'Docker',
        required: false,
        variants: ['cuda'],
      },
      {
        id: 'flowcept_settings',
        label: 'Flowcept settings',
        placeholder: '/data/settings',
        required: true,
        variants: ['native-cuda-attention'],
      },
    ],
  });
}

function mount(phase: 'stopped' | 'not_installed') {
  const onAction = vi.fn();
  render(
    <MemoryRouter>
      <ManagedServiceCard
        service={service(phase)}
        variant="native-cuda"
        configuration={{ model: '/data/models/qualified' }}
        onAction={onAction}
        onVariant={vi.fn()}
        onConfiguration={vi.fn()}
      />
    </MemoryRouter>,
  );
  return onAction;
}

describe('native service lifecycle', () => {
  it('keeps installed, serving and capture verification distinct', async () => {
    mount('stopped');
    expect(screen.getByText('Installed · stopped')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
    expect(screen.queryByText('Serving')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Deployment receipt'));
    expect(screen.getByText('Not verified')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'About attention verification' }));
    expect(
      await screen.findByText(/A fresh inference must produce a validated capture/u),
    ).toBeInTheDocument();
  });

  it('requires a separate explicit confirmation to delete retained data', async () => {
    const onAction = mount('not_installed');
    await userEvent.click(screen.getByRole('tab', { name: 'Storage' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete retained data' }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Delete retained vLLM data?' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Keep data' }));
    expect(onAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete retained data' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete retained data' }).at(-1)!);
    expect(onAction).toHaveBeenCalledTimes(1);
    // Only a reinstall can carry options (from scratch); delete_data never does.
    expect(onAction).toHaveBeenCalledWith('delete_data', undefined);
  });

  it('does not require container or attention configuration for plain native vLLM', () => {
    mount('not_installed');
    expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
    expect(
      screen.queryByRole('textbox', { name: 'vLLM Flowcept settings' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Container runtime')).not.toBeInTheDocument();
  });
});
