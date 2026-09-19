import { brand } from '@brand';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
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

    expect(await screen.findByRole('button', { name: `Connect to ${brand.agentName}` })).toBeVisible();
    expect(screen.getAllByText('Running')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: `Connect to ${brand.agentName}` }));
    expect(connect).toHaveBeenCalledWith('http://127.0.0.1:8089');
    await user.click(screen.getByRole('button', { name: 'Check status' }));
    expect(await screen.findAllByText('Running')).toHaveLength(1);
    expect(screen.queryByText('running')).not.toBeInTheDocument();
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
});
