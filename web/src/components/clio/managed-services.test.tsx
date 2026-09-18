import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const runtime = vi.hoisted(() => ({ desktop: true }));
const deployment = vi.hoisted(() => ({
  managedServiceCatalog: vi.fn(),
  runManagedServiceAction: vi.fn(),
  sshProfiles: vi.fn(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => runtime.desktop }));
vi.mock('@/tauri/infrastructure-setup', () => deployment);

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
  label,
  description: `${label} deployment`,
  recommended_variant: `${id}-default`,
  supports_stop: id !== 'relay',
  state: id === 'web_search' ? 'running' : 'not_installed',
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
  runtime.desktop = true;
  deployment.managedServiceCatalog.mockResolvedValue({
    facts: {
      target: 'local',
      os: 'windows',
      arch: 'x86_64',
      accelerator: 'none',
      docker_available: true,
      uv_available: true,
    },
    services,
  });
  deployment.sshProfiles.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ManagedServices', () => {
  it('separates resources from an opt-in single-provider chooser', async () => {
    const user = userEvent.setup();
    renderServices();

    expect(await screen.findByRole('heading', { name: 'Managed infrastructure' })).toBeVisible();
    expect(screen.getByText('CLIO resources')).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'CLIO Web Search' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'CLIO Relay' })).toBeVisible();
    expect(screen.getByText('Running')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'vLLM' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Model providers/u }));
    expect(screen.getByLabelText('Provider')).toBeDisabled();
    await user.click(screen.getByLabelText('Enable a CLIO-managed provider'));
    await user.click(screen.getByLabelText('Provider'));
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
        uv_available: true,
      },
      services: services.map((service) =>
        service.id === 'web_search'
          ? {
              ...service,
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

    expect(await screen.findByText('Requires Docker.')).toBeVisible();
  });

  it('keeps the infrastructure view usable while target inspection is pending', () => {
    deployment.managedServiceCatalog.mockReturnValue(new Promise(() => undefined));
    renderServices();

    expect(screen.getByRole('heading', { name: 'Managed infrastructure' })).toBeVisible();
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
              uv_available: true,
            },
            services,
          }),
    );
    renderServices();

    await user.click(screen.getByRole('radio', { name: 'SSH host' }));
    await user.click(await screen.findByRole('combobox', { name: 'SSH host' }));
    await user.click(screen.getByRole('option', { name: 'homelab' }));

    expect(await screen.findByText('Connecting to homelab')).toBeVisible();
    expect(screen.getByText(/existing CLIO services/u)).toBeVisible();
  });

  it('renders a recoverable error when target inspection fails', async () => {
    deployment.managedServiceCatalog.mockRejectedValue(new Error('Docker inspection stalled'));
    renderServices();

    expect(await screen.findByText('Could not inspect this computer')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('shows connection guidance without deployment controls in browser mode', () => {
    runtime.desktop = false;
    renderServices();

    expect(screen.getByText('Service deployment is available in CLIO Desktop')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });
});
