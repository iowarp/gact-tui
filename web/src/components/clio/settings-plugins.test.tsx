import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

const repository = vi.hoisted(() => ({
  pluginMarketplaces: vi.fn(),
  capabilities: vi.fn(),
  plugins: vi.fn(),
  agents: vi.fn(async () => []),
  savedMcpServices: vi.fn(async () => []),
  mcpServers: vi.fn(async () => []),
  discoverMcp: vi.fn(async () => ({ servers: [], next_cursor: '' })),
  inspectPlugin: vi.fn(),
  localLibrary: vi.fn(),
  exportLocalMarketplace: vi.fn(),
  reconnectMcpServer: vi.fn(),
  installPluginMarketplace: vi.fn(),
  trustPluginMarketplace: vi.fn(),
  updatePluginMarketplace: vi.fn(),
  uninstallPluginMarketplace: vi.fn(),
  checkPlugins: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import { ExtensionLibrary } from './extension-library';

const summary = {
  marketplace: 'lab',
  format: 'claude-code',
  trusted: true,
  plugins: ['clio-hdf5'],
  pending_trust: [],
  agents: [],
  diagnostics: [],
};

const pack = {
  id: 'documents',
  ref: 'clio/documents',
  version: '1.0.0',
  description: 'Every document format',
  kind: 'pack',
  format: 'agent-plugins',
  marketplace: 'clio',
  requires: [],
  members: ['pdf', 'xlsx'],
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
};

function renderLibrary() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TooltipProvider>
          <ExtensionLibrary />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The one list of every extension. */
const extensions = () => screen.findByRole('group', { name: 'Extensions' }, { timeout: 10_000 });

beforeEach(() => {
  repository.capabilities.mockResolvedValue({
    capabilities: { x_clio_agent_plugins: true, x_clio_extension_library: true },
    gact_versions: [],
  });
  repository.pluginMarketplaces.mockResolvedValue([
    {
      name: 'clio',
      source: '/opt/clio-agent-marketplace',
      commit: 'b092674ac163f70c',
      format: 'agent-plugins',
      trusted: true,
      trust_reason: 'default_marketplace',
      default: true,
      parent: '',
      installed_at: '',
      diagnostics: [],
    },
    {
      name: 'lab',
      source: 'https://example.org/lab.git',
      commit: '',
      format: 'claude-code',
      trusted: false,
      trust_reason: '',
      default: false,
      parent: '',
      installed_at: '',
      diagnostics: [
        { severity: 'error', code: 'hook_unmapped', message: 'hook X has no CLIO event' },
      ],
    },
  ]);
  repository.plugins.mockResolvedValue({ plugins: [pack], default_marketplace_error: null });
  repository.agents.mockResolvedValue([]);
  repository.savedMcpServices.mockResolvedValue([]);
  repository.mcpServers.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Extensions: marketplaces', () => {
  it('lists plugins and marketplaces as one list, each with a status word', async () => {
    renderLibrary();
    const list = await extensions();
    expect(await within(list).findByText('documents')).toBeVisible();
    expect(within(list).getAllByText('Trusted')).toHaveLength(2);
    expect(within(list).getByText('Not trusted')).toBeVisible();
    expect(within(list).getByText('1 problem')).toBeVisible();
    expect(within(list).getByText('Shipped')).toBeVisible();
    // Your library stays out of All until something is saved to it.
    expect(within(list).queryByText('Private local marketplace')).toBeNull();
  }, 20_000);

  it('requires the explicit trust step for an untrusted marketplace', async () => {
    const user = userEvent.setup();
    repository.trustPluginMarketplace.mockResolvedValue(summary);
    renderLibrary();
    const list = await extensions();
    await user.click(await within(list).findByRole('button', { name: 'Trust lab' }));
    const dialog = await screen.findByRole('dialog', { name: 'Trust lab?' });
    expect(within(dialog).getByText(/run commands, start servers and run hooks/u)).toBeVisible();
    expect(repository.trustPluginMarketplace).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: /^Trust marketplace/u }));
    await waitFor(() => expect(repository.trustPluginMarketplace).toHaveBeenCalledWith('lab'));
  }, 20_000);

  it('adds a marketplace by source from the Add menu', async () => {
    const user = userEvent.setup();
    repository.installPluginMarketplace.mockResolvedValue({ ...summary, trusted: false });
    renderLibrary();
    await extensions();
    await user.click(screen.getByRole('button', { name: 'Add options' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Marketplace…' }));
    const install = await screen.findByRole('dialog', { name: 'Install a marketplace' });
    await user.type(
      within(install).getByRole('textbox', { name: 'Source' }),
      'https://github.com/iowarp/clio-kit.git',
    );
    await user.type(within(install).getByRole('textbox', { name: 'Branch or tag' }), 'main');
    await user.click(within(install).getByRole('button', { name: 'Install' }));
    await waitFor(() =>
      expect(repository.installPluginMarketplace).toHaveBeenCalledWith({
        source: 'https://github.com/iowarp/clio-kit.git',
        ref: 'main',
        commit: undefined,
        name: undefined,
      }),
    );
  }, 20_000);

  it('accepts a waiting executable update from its source and refreshes the catalog', async () => {
    const user = userEvent.setup();
    const waiting = {
      ...pack,
      id: 'pdf',
      ref: 'clio/pdf',
      kind: 'plugin',
      members: [],
      pending_trust: true,
    };
    repository.plugins
      .mockResolvedValueOnce({ plugins: [waiting], default_marketplace_error: null })
      .mockResolvedValue({
        plugins: [{ ...waiting, pending_trust: false }],
        default_marketplace_error: null,
      });
    repository.trustPluginMarketplace.mockResolvedValue({ ...summary, marketplace: 'clio' });
    renderLibrary();
    const list = await extensions();
    expect(await within(list).findByText('Update waits for trust')).toBeVisible();
    expect(within(list).getByText('1 update waits for trust')).toBeVisible();
    await user.click(within(list).getByRole('button', { name: 'Trust the update from clio' }));
    const dialog = await screen.findByRole('dialog', { name: 'Trust the update from clio?' });
    expect(repository.trustPluginMarketplace).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: /^Trust update/u }));
    await waitFor(() => expect(repository.trustPluginMarketplace).toHaveBeenCalledWith('clio'));
    await waitFor(() => expect(within(list).queryByText('1 update waits for trust')).toBeNull());
    expect(repository.plugins.mock.calls.length).toBeGreaterThanOrEqual(2);
  }, 20_000);

  it('shows plugin check results per failing plugin', async () => {
    const user = userEvent.setup();
    repository.checkPlugins.mockResolvedValue({
      source: 'installed marketplace lab',
      ok: false,
      targets: [
        { kind: 'plugin', id: 'good', ok: true, diagnostics: [] },
        {
          kind: 'plugin',
          id: 'broken',
          ok: false,
          diagnostics: [
            { severity: 'error', code: 'prompt_missing', message: 'prompt/missing.md is missing' },
          ],
        },
      ],
      diagnostics: [],
      text: '1/2 passed -- check failed',
    });
    const scrolled = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    renderLibrary();
    const list = await extensions();
    await user.click(await within(list).findByRole('button', { name: 'Actions for lab' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Check plugins' }));
    const report = await screen.findByRole('region', { name: 'Plugin check results' });
    // On a phone the report lands below the menu that asked for it.
    expect(scrolled.mock.contexts).toContain(report);
    scrolled.mockRestore();
    expect(within(report).getByText('Failed')).toBeVisible();
    expect(within(report).getByText('1 of 2 passed')).toBeVisible();
    expect(within(report).getByText(/prompt\/missing.md is missing/u)).toBeVisible();
    expect(repository.checkPlugins).toHaveBeenCalledWith({ installed: 'lab' });
  }, 20_000);

  it('retains repository, source and removal on a remote marketplace and opens its pane', async () => {
    const user = userEvent.setup();
    repository.uninstallPluginMarketplace.mockResolvedValue(undefined);
    renderLibrary();
    const list = await extensions();
    await user.click(await within(list).findByRole('button', { name: 'Actions for lab' }));
    expect(screen.getByRole('menuitem', { name: 'Open repository' })).toHaveAttribute(
      'href',
      'https://example.org/lab',
    );
    await user.click(screen.getByRole('menuitem', { name: 'Copy source' }));
    expect(await navigator.clipboard.readText()).toBe('https://example.org/lab.git');
    await user.click(within(list).getByRole('button', { name: 'Explore lab' }));
    const pane = await screen.findByRole('complementary', { name: 'lab' });
    expect(within(pane).getByText('https://example.org/lab.git')).toBeVisible();
    expect(within(pane).getByText('hook X has no CLIO event')).toBeVisible();
    await user.click(within(list).getByRole('button', { name: 'Uninstall lab' }));
    const dialog = await screen.findByRole('dialog', { name: 'Uninstall lab?' });
    await user.click(within(dialog).getByRole('button', { name: /^Uninstall/u }));
    await waitFor(() => expect(repository.uninstallPluginMarketplace).toHaveBeenCalledWith('lab'));
  }, 20_000);

  it('keeps your private library actions in its menu and its saved items in its pane', async () => {
    const user = userEvent.setup();
    repository.agents.mockResolvedValue([
      {
        ref: 'user/dememory-clio',
        id: 'dememory-clio',
        name: 'Dememory Clio',
        description: 'My local scientist',
        kind: 'user',
        extends: 'clio/factorio',
        plugins: [],
        delta: { add: [], remove: ['memory'] },
        diagnostics: [],
      },
    ] as never);
    renderLibrary();
    const list = await extensions();
    const actions = await within(list).findByRole('button', {
      name: 'Actions for private-local',
    });
    await user.click(actions);
    expect(screen.getByRole('menuitem', { name: 'Back up with GitHub…' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Download marketplace ZIP' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Add remote marketplace…' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Back up with GitHub…' }));
    expect(await screen.findByRole('dialog', { name: 'Back up to GitHub' })).toBeVisible();
    const backup = screen.getByRole('dialog', { name: 'Back up to GitHub' });
    await user.click(within(backup).getAllByRole('button', { name: 'Close' })[0]!);
    await waitFor(() => expect(backup).not.toBeInTheDocument());
    await user.click(within(list).getByRole('button', { name: 'Explore private-local' }));
    const pane = await screen.findByRole('complementary', { name: 'Private local marketplace' });
    expect(await within(pane).findByText('Dememory Clio')).toBeVisible();
    expect(within(pane).queryByText(/Agent Plugins format/u)).toBeNull();
  }, 20_000);

  it('says why Add is unavailable on an older service', async () => {
    repository.capabilities.mockResolvedValue({
      capabilities: { x_clio_agent_plugins: true },
      gact_versions: [],
    });
    renderLibrary();
    expect(
      await screen.findByText(/Update the connected agent service to add or compose extensions/u),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  }, 20_000);

  it('shows one failure with Retry when the catalog cannot load', async () => {
    const user = userEvent.setup();
    repository.plugins.mockRejectedValueOnce(new Error('503 Service Unavailable'));
    renderLibrary();
    expect(await screen.findByText('Extensions couldn’t be loaded.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await extensions()).toBeVisible();
  }, 20_000);

  it('offers Add a marketplace and Discover when nothing is installed', async () => {
    repository.pluginMarketplaces.mockResolvedValue([]);
    repository.plugins.mockResolvedValue({ plugins: [], default_marketplace_error: null });
    renderLibrary();
    expect(await screen.findByText('No extensions yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add a marketplace' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Discover' })).toBeVisible();
  }, 20_000);
});
