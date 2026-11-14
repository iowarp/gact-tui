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
  localLibrary: vi.fn(),
  resolveAgent: vi.fn(),
  plugins: vi.fn(),
  saveUserAgent: vi.fn(),
  sessionDefaults: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
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
  repository.sessionDefaults.mockResolvedValue({
    agent_ref: '',
    default_agent_ref: 'clio/standard',
  });
  repository.localLibrary.mockResolvedValue({
    root: 'C:/clio',
    agents_directory: 'C:/clio/agents',
    plugins_directory: 'C:/clio/plugins',
    agents: [
      {
        ref: mine.ref,
        path: 'C:/clio/agents/my-analyst.json',
        definition: {
          id: mine.id,
          name: mine.name,
          description: '',
          extends: 'clio/standard',
          add: ['clio/hdf5'],
          remove: ['xlsx'],
        },
      },
    ],
  });
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
  it('lists your agents apart from installed ones, tags the default and deletes on confirm', async () => {
    const user = userEvent.setup();
    repository.deleteUserAgent.mockResolvedValue(undefined);
    renderSettings();
    const yours = await screen.findByRole('group', { name: 'Your agents' }, { timeout: 5000 });
    expect(await within(yours).findByText('My analyst')).toBeVisible();
    expect(within(yours).getByText('Based on CLIO and clio/hdf5, without xlsx')).toBeVisible();
    expect(within(yours).getByText('0 packages')).toBeVisible();
    const installed = screen.getByRole('group', { name: 'Installed agents' });
    expect(within(installed).getByText('CLIO')).toBeVisible();
    expect(await within(installed).findByText('Default')).toBeVisible();
    expect(within(installed).queryByRole('button', { name: /^Delete / })).toBeNull();
    await user.click(within(yours).getByRole('button', { name: 'Delete My analyst' }));
    const ask = await within(yours).findByRole('group', { name: 'Delete My analyst?' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(repository.deleteUserAgent).not.toHaveBeenCalled();
    await user.click(within(ask).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(repository.deleteUserAgent).toHaveBeenCalledWith('my-analyst'));
  });

  it('says in one line when the service does not offer agents', async () => {
    repository.capabilities.mockResolvedValue({ capabilities: {}, gact_versions: [] });
    renderSettings();
    expect(await screen.findByText('This service doesn’t offer agents.')).toBeVisible();
    expect(repository.agents).not.toHaveBeenCalled();
  });

  it('offers a retry in plain words when agents cannot be listed', async () => {
    const user = userEvent.setup();
    repository.agents.mockRejectedValueOnce(new Error('Request failed with 503'));
    renderSettings();
    expect(await screen.findByText('Agents couldn’t be loaded.')).toBeVisible();
    expect(screen.queryByText(/503/u)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Retry/u }));
    expect(await screen.findByRole('group', { name: 'Your agents' })).toBeVisible();
  });

  it('shows an intentional empty row when only installed agents exist', async () => {
    const user = userEvent.setup();
    repository.agents.mockResolvedValue([standard]);
    renderSettings();
    const yours = await screen.findByRole('group', { name: 'Your agents' });
    expect(within(yours).getByText('No agents of your own yet.')).toBeVisible();
    // The spec's group + is the one way to start an agent; the empty row adds no second button.
    expect(screen.getAllByRole('button', { name: 'New agent' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'New agent' }));
    // New agent starts from the installed agent and asks for the new agent's name straight away.
    const naming = await screen.findByRole('dialog', { name: 'Save as agent' });
    expect(within(naming).getByRole('textbox', { name: 'Agent name' })).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const pane = await screen.findByRole('complementary', { name: 'CLIO' });
    expect(await within(pane).findByRole('button', { name: 'Save local variation' })).toBeEnabled();
    // Every New agent asks again, even with the starter's pane already open.
    await user.click(screen.getByRole('button', { name: 'New agent' }));
    expect(await screen.findByRole('dialog', { name: 'Save as agent' })).toBeVisible();
  });

  it('shows the saved file of your agent from its more menu', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole('button', { name: 'More actions for My analyst' }));
    await user.click(await screen.findByRole('menuitem', { name: /View saved file/u }));
    const dialog = await screen.findByRole('dialog', { name: 'My analyst: saved file' });
    expect(await within(dialog).findByText('C:/clio/agents/my-analyst.json')).toBeVisible();
  });
});

it('explores an agent beside the list, resolves draft changes and saves a new local variation', async () => {
  const user = userEvent.setup();
  renderSettings();
  await user.click(await screen.findByRole('button', { name: 'Explore CLIO' }));
  const explorer = await screen.findByRole('complementary', { name: 'CLIO' });
  expect(screen.getByRole('button', { name: 'Explore CLIO' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await user.click(await within(explorer).findByRole('button', { name: 'Add package' }));
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
}, 15_000);

it('opens an agent from its row and closes the pane', async () => {
  const user = userEvent.setup();
  renderSettings();
  await user.click(await screen.findByText('My analyst'));
  const pane = await screen.findByRole('complementary', { name: 'My analyst' });
  await user.click(within(pane).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('complementary')).toBeNull();
});
