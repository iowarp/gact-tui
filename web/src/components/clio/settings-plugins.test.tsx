import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  pluginMarketplaces: vi.fn(),
  capabilities: vi.fn(async () => ({
    capabilities: { x_clio_agent_plugins: true },
    gact_versions: [],
  })),
  plugins: vi.fn(),
  installPluginMarketplace: vi.fn(),
  trustPluginMarketplace: vi.fn(),
  updatePluginMarketplace: vi.fn(),
  uninstallPluginMarketplace: vi.fn(),
  checkPlugins: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import { MarketplaceSettings } from './settings-plugins';

const summary = {
  marketplace: 'lab',
  format: 'claude-code',
  trusted: true,
  plugins: ['clio-hdf5'],
  pending_trust: [],
  agents: [],
  diagnostics: [],
};

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MarketplaceSettings />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
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
  repository.plugins.mockResolvedValue({
    plugins: [
      {
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
      },
    ],
    default_marketplace_error: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MarketplaceSettings', () => {
  it('requires the explicit trust step for an untrusted marketplace', async () => {
    const user = userEvent.setup();
    repository.trustPluginMarketplace.mockResolvedValue(summary);
    renderSettings();
    const marketplaces = await screen.findByRole('region', { name: 'Marketplaces' });
    expect(await within(marketplaces).findByText('Not trusted')).toBeVisible();
    expect(within(marketplaces).getByText('1 problem')).toBeVisible();
    expect(within(marketplaces).getAllByRole('button', { name: 'Trust' })).toHaveLength(1);
    await user.click(within(marketplaces).getByRole('button', { name: 'Trust' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/run commands, start servers and run hooks/u)).toBeVisible();
    expect(repository.trustPluginMarketplace).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Trust marketplace' }));
    await waitFor(() => expect(repository.trustPluginMarketplace).toHaveBeenCalledWith('lab'));
  });

  it('installs a marketplace by source without repeating the plugin inventory', async () => {
    const user = userEvent.setup();
    repository.installPluginMarketplace.mockResolvedValue({ ...summary, trusted: false });
    renderSettings();
    expect(await screen.findByRole('region', { name: 'Marketplaces' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Installed plugins' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add marketplace' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Source' }),
      'https://github.com/iowarp/clio-kit.git',
    );
    await user.type(screen.getByRole('textbox', { name: 'Branch or tag' }), 'main');
    await user.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() =>
      expect(repository.installPluginMarketplace).toHaveBeenCalledWith({
        source: 'https://github.com/iowarp/clio-kit.git',
        ref: 'main',
        commit: undefined,
        name: undefined,
      }),
    );
  });

  it('accepts a waiting executable update from its source and refreshes the catalog', async () => {
    const user = userEvent.setup();
    const waiting = {
      ...(await repository.plugins()).plugins[0],
      id: 'pdf',
      ref: 'clio/pdf',
      kind: 'plugin',
      members: [],
      pending_trust: true,
    };
    repository.plugins.mockClear();
    repository.plugins
      .mockResolvedValueOnce({ plugins: [waiting], default_marketplace_error: null })
      .mockResolvedValue({
        plugins: [{ ...waiting, pending_trust: false }],
        default_marketplace_error: null,
      });
    repository.trustPluginMarketplace.mockResolvedValue({ ...summary, marketplace: 'clio' });
    renderSettings();
    const marketplaces = await screen.findByRole('region', { name: 'Marketplaces' });
    expect(await within(marketplaces).findByText('1 update waits for trust')).toBeVisible();
    expect(
      within(marketplaces).getByRole('button', { name: 'Trust the update from clio' }),
    ).toBeVisible();
    await user.click(
      within(marketplaces).getByRole('button', { name: 'Trust the update from clio' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Trust the update from clio?')).toBeVisible();
    expect(repository.trustPluginMarketplace).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Trust update' }));
    await waitFor(() => expect(repository.trustPluginMarketplace).toHaveBeenCalledWith('clio'));
    await waitFor(() =>
      expect(within(marketplaces).queryByText('1 update waits for trust')).toBeNull(),
    );
    expect(repository.plugins.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

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
    renderSettings();
    await user.click(await screen.findByRole('button', { name: 'Actions for lab' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Check plugins' }));
    const report = await screen.findByRole('region', { name: 'Plugin check results' });
    // On a phone the report lands below the menu that asked for it.
    expect(scrolled.mock.contexts).toContain(report);
    scrolled.mockRestore();
    expect(within(report).getByText('Failed')).toBeVisible();
    expect(within(report).getByText('1 of 2 passed')).toBeVisible();
    expect(within(report).getByText(/prompt\/missing.md is missing/u)).toBeVisible();
    expect(repository.checkPlugins).toHaveBeenCalledWith({ installed: 'lab' });
  });

  it('keeps an installed private marketplace focused on its collection instead of source metadata', async () => {
    repository.pluginMarketplaces.mockResolvedValue([
      {
        name: 'private-local',
        source: 'D:/clio/config/plugins/local/private-local',
        format: 'agent-plugins',
        trusted: true,
        default: false,
        parent: '',
        trust_reason: 'local',
        commit: '',
        installed_at: '',
        diagnostics: [],
      },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MarketplaceSettings localCollection={<p>Saved local items</p>} onBackup={vi.fn()} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Private local marketplace/ }));
    expect(screen.getByText('Saved local items')).toBeVisible();
    expect(screen.queryByText('D:/clio/config/plugins/local/private-local')).toBeNull();
    expect(screen.queryByText(/Agent Plugins format/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back up with GitHub' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Actions for private-local' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Actions for private-local' }));
    expect(screen.getByRole('menuitem', { name: 'Back up with GitHub…' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Add remote marketplace…' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Update' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Check plugins' })).toBeVisible();
  });

  it('keeps source actions available while an agent-only local collection is collapsed', async () => {
    const onBackup = vi.fn();
    const onExport = vi.fn();
    const onLocalDetails = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MarketplaceSettings
          localCollection={<p>Saved local items</p>}
          onBackup={onBackup}
          onExport={onExport}
          onLocalDetails={onLocalDetails}
        />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    const actions = await screen.findByRole('button', { name: 'Actions for private-local' });
    expect(screen.queryByText('Saved local items')).toBeNull();
    await user.click(actions);
    expect(screen.queryByRole('menuitem', { name: 'Update' })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Back up with GitHub…' }));
    expect(onBackup).toHaveBeenCalledOnce();
    await user.click(actions);
    await user.click(screen.getByRole('menuitem', { name: 'Download marketplace ZIP' }));
    expect(onExport).toHaveBeenCalledOnce();
    await user.click(actions);
    await user.click(screen.getByRole('menuitem', { name: 'Marketplace details' }));
    expect(onLocalDetails).toHaveBeenCalledOnce();
    expect(screen.getByText('Saved local items')).toBeVisible();
    await user.click(actions);
    await user.click(screen.getByRole('menuitem', { name: 'Add remote marketplace…' }));
    const install = screen.getByRole('dialog', { name: 'Install a marketplace' });
    expect(within(install).getByRole('textbox', { name: 'Source' })).toBeVisible();
    expect(repository.installPluginMarketplace).not.toHaveBeenCalled();
  });

  it('retains repository, source, update and check actions on remote marketplaces', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole('button', { name: 'Actions for lab' }));
    expect(screen.getByRole('menuitem', { name: 'Open repository' })).toHaveAttribute(
      'href',
      'https://example.org/lab',
    );
    await user.click(screen.getByRole('menuitem', { name: 'Copy source' }));
    expect(await navigator.clipboard.readText()).toBe('https://example.org/lab.git');
    await user.click(screen.getByRole('button', { name: 'Actions for lab' }));
    expect(screen.getByRole('menuitem', { name: 'Update' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Check plugins' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Uninstall' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Marketplace details' }));
    expect(screen.getByText('https://example.org/lab.git')).toBeVisible();
  });
});
