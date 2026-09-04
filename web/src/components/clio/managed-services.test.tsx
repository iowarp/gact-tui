import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ desktop: true }));
const deployment = vi.hoisted(() => ({
  managedServices: vi.fn(),
  preflightTarget: vi.fn(),
  runManagedServiceAction: vi.fn(),
  sshProfiles: vi.fn(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => runtime.desktop }));
vi.mock('@/tauri/infrastructure-setup', () => deployment);

import { ManagedServices } from './managed-services';

const services = [
  ['vllm', 'vLLM'],
  ['llama_cpp', 'llama.cpp'],
  ['web_search', 'CLIO Web Search'],
  ['relay', 'CLIO Relay'],
].map(([id, label]) => ({
  id,
  label,
  description: `${label} deployment`,
  recommended_variant: `${id}-default`,
  supports_stop: id !== 'relay',
  configuration_fields: [],
  variants: [
    {
      id: `${id}-default`,
      label: 'Recommended',
      version: 'pinned',
      installation_type: 'container',
      artifact: `example/${id}:pinned`,
      compatible: true,
      incompatibility: null,
    },
  ],
}));

function renderServices() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ManagedServices />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  runtime.desktop = true;
  deployment.preflightTarget.mockResolvedValue({
    target: 'local',
    os: 'windows',
    arch: 'x86_64',
    accelerator: 'none',
    docker: true,
    uv: true,
  });
  deployment.managedServices.mockResolvedValue(services);
  deployment.sshProfiles.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ManagedServices', () => {
  it('shows all four constrained deployment drivers on desktop', async () => {
    renderServices();

    expect(await screen.findByRole('heading', { name: 'vLLM' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'llama.cpp' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'CLIO Web Search' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'CLIO Relay' })).toBeVisible();
  });

  it('shows connection guidance without deployment controls in browser mode', () => {
    runtime.desktop = false;
    renderServices();

    expect(screen.getByText('Service deployment is available in CLIO Desktop')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });
});
