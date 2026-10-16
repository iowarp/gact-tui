import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ManagedServiceDefinition } from '@clio/core/v3';
import { services } from '@/test-fixtures/managed-services';
import { ManagedServiceCard } from './service-management-panel';

afterEach(cleanup);

const definition = services.find((service) => service.id === 'llama_cpp')!;
const fields = ['model_path', 'hf_model'].map((id) => ({
  id,
  label: id === 'model_path' ? 'GGUF model path' : 'Hugging Face model',
  placeholder: '',
  required: false,
  options: [],
}));

function renderCard(installed = false, variant = 'native-windows-cpu') {
  const action = vi.fn();
  const service: ManagedServiceDefinition = {
    ...definition,
    state: installed ? 'stopped' : 'not_installed',
    configuration_fields: fields,
    variants: [{ ...definition.variants[0]!, id: variant }],
    observation: installed
      ? {
          phase: 'stopped',
          installed: true,
          running: false,
          serving: false,
          worker_alive: false,
          provenance_ingesting: false,
          attention_verified: false,
          configuration_revision: '',
          definition_version: '1',
          evidence_directory: '',
          effective_artifacts: {},
          observed_at: 1,
        }
      : undefined,
  };
  function Review() {
    const [configuration, setConfiguration] = useState<Record<string, string>>({});
    return (
      <ManagedServiceCard
        service={service}
        variant={variant}
        hostLabel="this computer"
        configuration={configuration}
        onAction={(value) => action(value, configuration)}
        onConfiguration={(field, value) =>
          setConfiguration((previous) => ({ ...previous, [field]: value }))
        }
        onVariant={() => undefined}
      />
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Review />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), action };
}

describe('llama.cpp runtime installation', () => {
  it('installs without requiring a GGUF or changing the access defaults', async () => {
    const { user, action } = renderCard();
    expect(screen.queryByRole('textbox', { name: 'llama.cpp GGUF model path' })).toBeNull();
    expect(
      screen.getByText(
        'Install the runtime without a model file. Choose a model when you are ready to start.',
      ),
    ).toBeVisible();
    const install = screen.getByRole('button', { name: /^Install$/ });
    expect(install).toBeEnabled();
    await user.click(install);
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith('install', {});
  });

  it('offers the model field beside Start after installation and requires a model only there', async () => {
    const { user, action } = renderCard(true);
    expect(screen.getByText('Runtime installed. Choose a model to serve.')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Start$/ })).toBeDisabled();
    await user.type(
      screen.getByRole('textbox', { name: 'llama.cpp GGUF model path' }),
      'C:/models/demo.gguf',
    );
    expect(screen.getByRole('button', { name: /^Start$/ })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /^Start$/ }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith('start', { model_path: 'C:/models/demo.gguf' });
    expect(screen.queryByRole('textbox', { name: 'llama.cpp Hugging Face model' })).toBeNull();
  });

  it('accepts one model source for container Start and allows reinstall without one', async () => {
    const { user } = renderCard(true, 'cpu');
    await user.type(
      screen.getByRole('textbox', { name: 'llama.cpp Hugging Face model' }),
      'org/model:Q4',
    );
    expect(screen.getByRole('button', { name: /^Start$/ })).toBeEnabled();
    await user.type(
      screen.getByRole('textbox', { name: 'llama.cpp GGUF model path' }),
      '/model.gguf',
    );
    expect(screen.getByRole('button', { name: /^Start$/ })).toBeDisabled();
    await user.clear(screen.getByRole('textbox', { name: 'llama.cpp GGUF model path' }));
    await user.clear(screen.getByRole('textbox', { name: 'llama.cpp Hugging Face model' }));
    await user.click(screen.getByRole('tab', { name: 'Configuration' }));
    expect(screen.getByRole('button', { name: /^Reinstall runtime$/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reinstall from scratch' })).toBeEnabled();
  });
});
