import type { AgentResolution, SessionAgent } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

const repository = vi.hoisted(() => ({
  sessionAgent: vi.fn(),
  capabilities: vi.fn(async () => ({
    capabilities: { x_clio_agent_plugins: true },
    gact_versions: [],
  })),
  updateSessionAgent: vi.fn(),
  plugins: vi.fn(),
  agents: vi.fn(),
  previewPluginRemoval: vi.fn(),
  saveUserAgent: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AgentCompositionView } from './agent-composition-view';

function plugin(
  id: string,
  provenance: AgentResolution['plugins'][number]['provenance'],
  extra: Partial<AgentResolution['plugins'][number]> = {},
): AgentResolution['plugins'][number] {
  return {
    id,
    version: '1.0.0',
    kind: 'plugin',
    marketplace: 'clio',
    description: `${id} plugin`,
    provenance,
    requires: [],
    members: [],
    removable: true,
    ...extra,
  };
}

const resolution: AgentResolution = {
  agent: {
    ref: 'clio/standard',
    id: 'standard',
    name: 'CLIO',
    role: 'a scientific assistant',
    description: '',
    version: '1.0.0',
    marketplace: 'clio',
    parent: '',
    kind: 'agent',
  },
  plugins: [
    plugin('core', { source: 'core', via: 'core', label: 'core' }, { removable: false }),
    plugin('shell', { source: 'agent', via: 'standard', label: 'standard' }),
    plugin(
      'documents',
      { source: 'agent', via: 'standard', label: 'standard' },
      { kind: 'pack', members: ['pdf', 'xlsx'] },
    ),
    plugin(
      'pdf',
      { source: 'pack', via: 'documents', label: 'pack documents' },
      { requires: ['document-runtime'] },
    ),
    plugin('document-runtime', { source: 'required', via: 'pdf', label: 'required by pdf' }),
  ],
  removed: [],
  tools: [{ name: 'shell_run', plugin: 'shell', description: '' }],
  skills: [],
  subagents: [],
  flows: [],
  hooks: [],
  commands: [],
  catalogs: [],
  mcp_servers: {},
  prompt: {
    sections: [
      {
        section: 'identity',
        fragments: [
          {
            id: 'standard.identity',
            plugin: 'agent:standard',
            section: 'identity',
            text: 'You are CLIO.',
          },
        ],
      },
      {
        section: 'capabilities',
        fragments: [
          {
            id: 'shell.prefer-gh',
            plugin: 'shell',
            section: 'capabilities',
            text: 'Prefer gh.',
            tokens: 12,
          },
        ],
      },
    ],
    digest: 'd',
    warnings: [],
  },
  delta: { add: [], remove: ['xlsx'] },
  diagnostics: [],
  digest: 'r',
};

const sessionAgent: SessionAgent = {
  session_id: 'sess_1',
  delta: { add: [], remove: ['xlsx'] },
  subagent: false,
  resolution,
};

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <AgentCompositionView sessionId="sess_1" />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  repository.sessionAgent.mockResolvedValue(sessionAgent);
  repository.agents.mockResolvedValue([
    { ref: 'clio/standard', id: 'standard', name: 'CLIO', plugins: [], kind: 'agent' },
  ]);
  repository.plugins.mockResolvedValue({
    plugins: [
      {
        id: 'hdf5',
        ref: 'clio/hdf5',
        version: '1.0.0',
        description: 'Read HDF5 files',
        kind: 'plugin',
        format: 'agent-plugins',
        marketplace: 'clio',
        requires: [],
        members: [],
        tools: [],
        skills: [],
        mcp_servers: [],
        subagents: [],
        flows: [],
        hooks: [],
        commands: [],
        catalogs: [],
        fragments: [],
        trusted: true,
        pending_trust: false,
        diagnostics: [],
      },
    ],
    default_marketplace_error: null,
  });
  repository.updateSessionAgent.mockImplementation(
    async (_sid: string, input: { delta: SessionAgent['delta'] }) => ({
      ...sessionAgent,
      delta: input.delta,
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AgentCompositionView', () => {
  it('shows every active plugin with its provenance and nests pack members under their pack', async () => {
    renderView();
    const active = await screen.findByRole('list', { name: 'Active plugins' });
    expect(within(active).getByText('Core')).toBeVisible();
    expect(within(active).getAllByText('From standard')).toHaveLength(2);
    expect(within(active).getByText('Required by pdf')).toBeVisible();
    const members = within(active).getByRole('list', { name: 'Members of documents' });
    expect(within(members).getByText('In pack documents')).toBeVisible();
    expect(within(members).getByText('xlsx · not in this conversation')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remove core' })).toBeNull();
    expect(screen.getByText('Removed by you')).toBeVisible();
  });

  it('previews the cascade before a removal and applies the whole delta only on confirm', async () => {
    const user = userEvent.setup();
    repository.previewPluginRemoval.mockResolvedValue({
      plugin: 'document-runtime',
      removes: [
        { id: 'pdf', reason: { reason: 'cascade', because: 'document-runtime' } },
        { id: 'document-runtime', reason: { reason: 'removed', because: '' } },
      ],
      tools_removed: ['prepare_document'],
    });
    renderView();
    await user.click(await screen.findByRole('button', { name: 'Remove document-runtime' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByText('pdf')).toBeVisible();
    expect(within(dialog).getByText('requires document-runtime')).toBeVisible();
    expect(within(dialog).getByText('prepare_document')).toBeVisible();
    expect(repository.previewPluginRemoval).toHaveBeenCalledWith({
      ref: 'clio/standard',
      plugin: 'document-runtime',
      delta: { add: [], remove: ['xlsx'] },
    });
    expect(repository.updateSessionAgent).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Remove 2 plugins' }));
    await waitFor(() =>
      expect(repository.updateSessionAgent).toHaveBeenCalledWith('sess_1', {
        delta: { add: [], remove: ['xlsx', 'document-runtime'] },
      }),
    );
  });

  it('adds a plugin from the + menu and adds a removed plugin back', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(await screen.findByRole('button', { name: 'Add plugin' }));
    await user.click(await screen.findByRole('option', { name: /hdf5/u }));
    await waitFor(() =>
      expect(repository.updateSessionAgent).toHaveBeenCalledWith('sess_1', {
        delta: { add: ['clio/hdf5'], remove: ['xlsx'] },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Add back' }));
    await waitFor(() =>
      expect(repository.updateSessionAgent).toHaveBeenLastCalledWith('sess_1', {
        delta: { add: ['clio/hdf5'], remove: [] },
      }),
    );
  });

  it('saves the composition as a user agent: parent plus delta', async () => {
    const user = userEvent.setup();
    repository.saveUserAgent.mockResolvedValue({
      ref: 'user/my-analyst',
      id: 'my-analyst',
      name: 'My analyst',
      kind: 'user',
      plugins: [],
    });
    renderView();
    await user.click(await screen.findByRole('button', { name: 'Save as agent' }));
    await user.type(screen.getByRole('textbox', { name: 'Agent name' }), 'My analyst');
    expect(screen.getByText('Saved as user/my-analyst.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save agent' }));
    await waitFor(() =>
      expect(repository.saveUserAgent).toHaveBeenCalledWith({
        id: 'my-analyst',
        name: 'My analyst',
        description: '',
        extends: 'clio/standard',
        add: [],
        remove: ['xlsx'],
      }),
    );
  });

  it('attributes every prompt fragment to its plugin', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(await screen.findByRole('tab', { name: 'Prompt' }));
    expect(
      await screen.findByRole('article', { name: 'shell.prefer-gh from shell' }),
    ).toHaveTextContent('Prefer gh.');
    expect(
      screen.getByRole('article', { name: 'standard.identity from Agent standard' }),
    ).toHaveTextContent('You are CLIO.');
    expect(screen.getByRole('region', { name: 'Capabilities section' })).toBeVisible();
  });

  it('says so instead of calling plugin routes when the service lacks agent plugins', async () => {
    repository.capabilities.mockResolvedValueOnce({ capabilities: {}, gact_versions: [] });
    renderView();
    expect(await screen.findByText('Agents are not composable here')).toBeVisible();
    expect(repository.sessionAgent).not.toHaveBeenCalled();
    expect(repository.plugins).not.toHaveBeenCalled();
  });

  it('keeps a defined subagent read-only', async () => {
    repository.sessionAgent.mockResolvedValue({ ...sessionAgent, subagent: true });
    renderView();
    expect(await screen.findByText(/runs a defined subagent/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add plugin' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove shell' })).toBeNull();
  });
});
