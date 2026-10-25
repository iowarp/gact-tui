import { agentResolutionSchema, pluginEntrySchema } from '@clio/core/v3';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  agents: vi.fn(),
  capabilities: vi.fn(),
  deleteUserAgent: vi.fn(),
  resolveAgent: vi.fn(),
  plugins: vi.fn(),
  saveUserAgent: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import { AgentSettings } from './settings-agents';

const standard = {
  ref: 'clio/standard',
  id: 'standard',
  name: 'CLIO',
  description: 'A scientific assistant',
  role: 'a scientific assistant',
  version: '1.0.0',
  marketplace: 'clio',
  kind: 'agent',
  flow: { id: 'react', options: {} },
  plugins: [{ ref: 'shell', layer: 'agent' }],
};
const mine = {
  ref: 'user/my-analyst',
  id: 'my-analyst',
  name: 'My analyst',
  kind: 'user',
  extends: 'clio/standard',
  delta: { add: ['clio/hdf5'], remove: ['xlsx'] },
  plugins: [],
};

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TooltipProvider>
          <AgentSettings />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  repository.capabilities.mockResolvedValue({
    capabilities: { x_clio_agent_plugins: true },
    gact_versions: [],
  });
  repository.agents.mockResolvedValue([standard, mine]);
  repository.plugins.mockResolvedValue({
    plugins: [
      pluginEntrySchema.parse({
        id: 'hdf5',
        ref: 'clio/hdf5',
        marketplace: 'clio',
        trusted: true,
        description: 'Read scientific files',
      }),
    ],
  });
  repository.resolveAgent.mockImplementation(async (_ref, delta) =>
    agentResolutionSchema.parse({
      agent: { ref: standard.ref, id: standard.id, name: standard.name },
      plugins: [
        {
          id: 'core',
          marketplace: 'clio-builtin',
          removable: false,
          provenance: { source: 'core' },
        },
        ...(delta?.add ?? []).map((ref: string) => ({
          id: ref.split('/').at(-1),
          marketplace: 'clio',
          provenance: { source: 'user' },
        })),
      ],
      prompt: {
        sections: [
          {
            section: 'identity',
            fragments: [
              { id: 'standard.identity', plugin: 'agent:standard', text: 'You are CLIO.' },
            ],
          },
        ],
      },
    }),
  );
  repository.saveUserAgent.mockResolvedValue(mine);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AgentSettings', () => {
  it('lists your agents apart from installed ones and deletes yours only on confirm', async () => {
    const user = userEvent.setup();
    repository.deleteUserAgent.mockResolvedValue(undefined);
    renderSettings();
    const yours = await screen.findByRole('region', { name: 'Your agents' });
    expect(await within(yours).findByText('My analyst')).toBeVisible();
    const installed = screen.getByRole('region', { name: 'Installed agents' });
    expect(within(installed).getByText('CLIO')).toBeVisible();
    expect(within(installed).queryByRole('button', { name: /^Delete / })).toBeNull();
    await user.click(within(yours).getByRole('button', { name: 'Delete My analyst' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(repository.deleteUserAgent).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete agent' }));
    await waitFor(() => expect(repository.deleteUserAgent).toHaveBeenCalledWith('my-analyst'));
  });

  it('says so when the service does not compose agents from plugins', async () => {
    repository.capabilities.mockResolvedValue({ capabilities: {}, gact_versions: [] });
    renderSettings();
    expect(await screen.findByText('Plugins are not available on this service')).toBeVisible();
    expect(repository.agents).not.toHaveBeenCalled();
  });
});

it('opens the full agent row, resolves draft changes and saves a new local variation', async () => {
  const user = userEvent.setup();
  renderSettings();
  await user.click(await screen.findByRole('button', { name: 'Explore CLIO' }));
  const explorer = await screen.findByRole('dialog', { name: 'CLIO' });
  await user.click(await within(explorer).findByRole('button', { name: 'Add plugin' }));
  await user.click(await screen.findByRole('option', { name: /hdf5/u }));
  await waitFor(() =>
    expect(repository.resolveAgent).toHaveBeenCalledWith(
      'clio/standard',
      { add: ['clio/hdf5'], remove: [] },
      expect.anything(),
    ),
  );
  await user.click(within(explorer).getByRole('button', { name: 'Save local variation' }));
  const save = screen.getByRole('dialog', { name: 'Save as agent' });
  await user.type(within(save).getByRole('textbox', { name: 'Agent name' }), 'Local analyst');
  await user.click(within(save).getByRole('button', { name: 'Save agent' }));
  await waitFor(() =>
    expect(repository.saveUserAgent).toHaveBeenCalledWith({
      id: 'local-analyst',
      name: 'Local analyst',
      description: '',
      create_only: true,
      extends: 'clio/standard',
      add: ['clio/hdf5'],
      remove: [],
    }),
  );
});

it('lets a person save an unchanged agent as a local starting point and collapse marketplaces', async () => {
  const user = userEvent.setup();
  renderSettings();
  const installed = await screen.findByRole('region', { name: 'Installed agents' });
  await user.click(within(installed).getByRole('button', { name: /clio 1/u }));
  expect(within(installed).queryByRole('button', { name: 'Explore CLIO' })).not.toBeInTheDocument();
  await user.click(within(installed).getByRole('button', { name: /clio 1/u }));
  await user.click(within(installed).getByRole('button', { name: 'Explore CLIO' }));
  expect(await screen.findByRole('button', { name: 'Save local variation' })).toBeEnabled();
});
