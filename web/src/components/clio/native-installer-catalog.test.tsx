import { managedServiceDefinitionSchema } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import scenarios from '../../../tests/review/service-methods-catalog.json';
import { ManagedServiceCard } from './service-management-panel';
import { configurationForVariant } from './managed-service-target-utils';

afterEach(cleanup);
function definition(host: number, id: string) {
  return managedServiceDefinitionSchema.parse(
    scenarios[host]!.services.find((row) => row.id === id),
  );
}
function mount(host: number, id: string, configuration: Record<string, string> = {}) {
  const service = definition(host, id);
  render(
    <MemoryRouter>
      <ManagedServiceCard
        service={service}
        setup
        variant={service.recommended_variant}
        configuration={configuration}
        onAction={vi.fn()}
        onVariant={vi.fn()}
        onConfiguration={vi.fn()}
      />
    </MemoryRouter>,
  );
  return service;
}
it('offers AMD Vulkan and ROCm from the backend catalog without requiring a GGUF to install', async () => {
  mount(0, 'llama_cpp');
  expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
  expect(screen.getByRole('radio', { name: /^Native/ })).toBeChecked();
  expect(screen.getByRole('radio', { name: /^Containers/ })).toBeDisabled();
  await userEvent.click(screen.getByRole('combobox', { name: 'llama.cpp Native variant' }));
  expect(screen.getByRole('option', { name: /AMD ROCm/ })).toBeEnabled();
  expect(screen.getByRole('option', { name: /Vulkan/ })).toBeEnabled();
});
it('preserves explicit GPU offload controls across native AMD variants', () => {
  const service = definition(0, 'llama_cpp');
  for (const variant of ['native-windows-rocm', 'native-windows-vulkan']) {
    expect(
      configurationForVariant({ 'param.gpu_layers': '0' }, service.parameters, variant),
    ).toEqual({ 'param.gpu_layers': '0' });
  }
});
it('installs native Ollama before a model is chosen', () => {
  mount(2, 'ollama');
  expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
  expect(screen.queryByRole('textbox', { name: /Ollama Model/ })).not.toBeInTheDocument();
});
it.each(['flowcept', 'cmf'])('offers container-free %s and site database settings', (id) => {
  mount(2, id, { database_mode: 'site' });
  expect(screen.getByRole('radio', { name: /^Native/ })).toBeChecked();
  expect(screen.getByRole('textbox', { name: /Site database settings file/ })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
});
