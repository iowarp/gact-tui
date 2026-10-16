import { managedServiceDefinitionSchema } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManagedServiceCard } from './service-management-panel';
import {
  ServiceInstallationMethod,
  ServiceMethodAvailability,
} from './service-installation-method';

afterEach(cleanup);
const variant = (id: string, install_type: string, compatible: boolean) => ({
  id,
  install_type,
  compatible,
  label: id,
  version: 'pinned',
  artifact: 'pinned',
  reason: compatible ? 'Ready' : `${id} unavailable on this computer`,
});
function definition(native: boolean, containers: boolean) {
  return managedServiceDefinitionSchema.parse({
    id: 'vllm',
    label: 'vLLM',
    category: 'model_runtime',
    description: 'Model server',
    recommended_variant: native ? 'native-xpu' : 'cpu',
    state: 'not_installed',
    supports_stop: true,
    variants: [variant('native-xpu', 'native_uv', native), variant('cpu', 'container', containers)],
    configuration_fields: [{ id: 'model', label: 'Model', required: true, placeholder: 'model' }],
  });
}
describe('host-specific installation methods', () => {
  it.each([
    [true, false],
    [false, true],
    [true, true],
    [false, false],
  ])('reports native %s and containers %s independently before setup', (native, containers) => {
    render(<ServiceMethodAvailability service={definition(native, containers)} />);
    expect(screen.getByText(`Native: ${native ? 'available' : 'unavailable here'}`)).toBeVisible();
    expect(
      screen.getByText(`Containers: ${containers ? 'available' : 'unavailable here'}`),
    ).toBeVisible();
  });
  it('keeps native usable on a host with no container runtime', () => {
    render(
      <ServiceInstallationMethod
        service={definition(true, false)}
        variant="native-xpu"
        onVariant={vi.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: /^Native/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Containers/ })).toBeDisabled();
  });
  it('lets a user escape an incompatible saved variant without opening Advanced settings', async () => {
    const action = vi.fn();
    function Review() {
      const [selected, setSelected] = useState('native-xpu');
      return (
        <ManagedServiceCard
          service={definition(false, true)}
          variant={selected}
          configuration={{ model: 'test' }}
          hostLabel="Windows computer"
          onVariant={setSelected}
          onConfiguration={vi.fn()}
          onAction={() => action(selected)}
        />
      );
    }
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
    expect(screen.queryByRole('textbox', { name: 'vLLM Model' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /^Containers/ }));
    expect(screen.getByRole('textbox', { name: 'vLLM Model' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(action).toHaveBeenCalledWith('cpu');
  });
  it('switches methods without losing other settings', async () => {
    function Review() {
      const [selected, setSelected] = useState('native-xpu');
      const [configuration, setConfiguration] = useState<Record<string, string>>({ model: '' });
      return (
        <MemoryRouter>
          <ManagedServiceCard
            service={definition(true, true)}
            variant={selected}
            configuration={configuration}
            onVariant={setSelected}
            onConfiguration={(key, value) =>
              setConfiguration((prior) => ({ ...prior, [key]: value }))
            }
            onAction={vi.fn()}
          />
          <output>{selected}</output>
        </MemoryRouter>
      );
    }
    render(<Review />);
    await userEvent.type(screen.getByRole('textbox', { name: 'vLLM Model' }), 'my-model');
    await userEvent.click(screen.getByRole('radio', { name: /^Containers/ }));
    expect(screen.getByRole('status')).toHaveTextContent('cpu');
    expect(screen.getByRole('textbox', { name: 'vLLM Model' })).toHaveValue('my-model');
    await userEvent.click(screen.getByRole('radio', { name: /^Native/ }));
    expect(screen.getByRole('status')).toHaveTextContent('native-xpu');
    expect(screen.getByRole('textbox', { name: 'vLLM Model' })).toHaveValue('my-model');
  });
  it('locks the method for an owned stopped installation', () => {
    const service = definition(true, true);
    service.state = 'stopped';
    render(
      <ServiceInstallationMethod service={service} variant="native-xpu" onVariant={vi.fn()} />,
    );
    expect(screen.getByRole('radio', { name: /^Native/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^Containers/ })).toBeDisabled();
  });
  it('restores the chosen native variant after visiting Containers', async () => {
    const service = definition(true, true);
    service.variants.push(variant('native-xpu-attention', 'native_uv', true));
    function Review() {
      const [selected, setSelected] = useState('native-xpu');
      return (
        <>
          <ServiceInstallationMethod service={service} variant={selected} onVariant={setSelected} />
          <output>{selected}</output>
        </>
      );
    }
    render(<Review />);
    await userEvent.click(screen.getByRole('combobox', { name: 'vLLM Native variant' }));
    await userEvent.click(screen.getByRole('option', { name: /^native-xpu-attention/ }));
    await userEvent.click(screen.getByRole('radio', { name: /^Containers/ }));
    expect(screen.getByRole('status')).toHaveTextContent('cpu');
    await userEvent.click(screen.getByRole('radio', { name: /^Native/ }));
    expect(screen.getByRole('status')).toHaveTextContent('native-xpu-attention');
  });
  it('does not describe a native app with container databases as container-free', () => {
    const service = definition(false, true);
    service.variants = [variant('managed', 'supervised_stack', true)];
    render(<ServiceInstallationMethod service={service} variant="managed" onVariant={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /^Containers/ })).toBeChecked();
    expect(
      screen.getByText('The application runs natively; its databases require containers.'),
    ).toBeVisible();
    expect(screen.getByRole('radio', { name: /^Native/ })).toBeDisabled();
  });
});
