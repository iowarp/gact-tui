import { connectorSchema, pluginEntrySchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

const repository = vi.hoisted(() => ({
  pluginMarketplaces: vi.fn(async () => []),
  capabilities: vi.fn(),
  plugins: vi.fn(),
  connectors: vi.fn(),
  connectorLogo: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg"/>'),
  agents: vi.fn(async () => []),
  savedMcpServices: vi.fn(async () => []),
  mcpServers: vi.fn(async () => []),
  discoverMcp: vi.fn(async () => ({ servers: [], next_cursor: '' })),
  inspectPlugin: vi.fn(),
  localLibrary: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import {
  bundlingPlugin,
  connectorPluginContents,
  connectorSetupWords,
  followingPlugin,
} from '@/lib/connector-plugin';
import { extensionEntries } from '@/lib/extension-library-entries';
import { ConnectorPane } from './connector-pane';
import { ExtensionLibrary } from './extension-library';
import { PluginChangePendingNotice } from './plugin-change-pending-notice';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const connector = (value: Record<string, unknown>) =>
  connectorSchema.parse({
    description: 'A connector',
    state: { status: 'ready', needs: [] },
    ...value,
  });

const plugin = (value: Record<string, unknown>) =>
  pluginEntrySchema.parse({ marketplace: 'clio', trusted: true, ...value });

/** A large synthetic catalog: a plugin with many skills, a sign-in, a secret, a custom one. */
const viewer = connector({
  id: 'viewer',
  name: 'Scientific viewer',
  enabled: true,
  tool_count: 13,
  plugin: 'viewer-scenes',
  plugin_ref: 'clio/viewer-scenes',
});
const home = connector({
  id: 'home',
  name: 'Home hub',
  enabled: false,
  plugin: 'home',
  plugin_ref: 'clio/home',
  state: { status: 'needs', needs: ['url', 'token'] },
  needs: [
    { key: 'url', kind: 'address', label: 'Hub address', required: true },
    { key: 'token', kind: 'secret', label: 'Access token', required: true },
    { key: 'note', kind: 'value', label: 'Note', required: false },
  ],
});
const structures = connector({
  id: 'structures',
  name: 'Structure viewer',
  enabled: true,
  tool_count: 4,
  plugin_ref: 'clio-connectors/connector-structures',
});
const custom = connector({
  id: 'mine',
  name: 'My server',
  source: 'custom',
  enabled: true,
  tool_count: 5,
  plugin_ref: 'clio-connectors/connector-mine',
});
const many = Array.from({ length: 12 }, (_, index) => `viewer-skill-${index + 1}`);
const plugins = [
  plugin({
    id: 'viewer-scenes',
    ref: 'clio/viewer-scenes',
    description: 'Work with scenes in the viewer',
    skills: many,
    mcp_servers: ['viewer'],
    follows: 'viewer',
    connector: { id: 'viewer', name: 'Scientific viewer', enabled: true, status: 'ready' },
  }),
  plugin({
    id: 'home',
    ref: 'clio/home',
    description: 'Read the home hub',
    skills: ['home-best-practices', 'home-sensors'],
    mcp_servers: ['home'],
    follows: 'home',
    connector: { id: 'home', name: 'Home hub', enabled: false },
  }),
  plugin({
    id: 'connector-structures',
    ref: 'clio-connectors/connector-structures',
    marketplace: 'clio-connectors',
    mcp_servers: ['structures'],
    follows: 'structures',
    connector: { id: 'structures', name: 'Structure viewer', enabled: true, status: 'ready' },
  }),
  plugin({ id: 'tools', ref: 'clio/tools', description: 'Lab tools', skills: ['a'] }),
];

describe('connectors and plugins are shown as what they are (PL-D1)', () => {
  it('finds the plugin that bundles a connector, says what it brings and needs', () => {
    expect(followingPlugin(viewer, plugins)?.id).toBe('viewer-scenes');
    expect(followingPlugin({ id: 'home', plugin_ref: null }, plugins)?.id).toBe('home');
    expect(bundlingPlugin(viewer, plugins)?.id).toBe('viewer-scenes');
    // A carrier brings only the server: that entry is a connector.
    expect(followingPlugin(structures, plugins)?.id).toBe('connector-structures');
    expect(bundlingPlugin(structures, plugins)).toBeUndefined();
    expect(connectorPluginContents(viewer, bundlingPlugin(viewer, plugins))).toBe(
      '12 skills, 1 MCP server (13 tools)',
    );
    expect(connectorPluginContents(home, bundlingPlugin(home, plugins))).toBe(
      '2 skills, 1 MCP server',
    );
    expect(connectorPluginContents(structures, undefined)).toBe('1 MCP server (4 tools)');
    expect(connectorSetupWords(home)).toBe('Needs hub address and access token');
    expect(connectorSetupWords(viewer)).toBe('');
  });

  it('lists each one once: plugins under Plugins, connectors under Connectors', () => {
    const base = { plugins, marketplaces: [], saved: [], servers: [] };
    const catalog = [viewer, home, structures, custom];
    const all = extensionEntries({ ...base, type: 'all', connectors: catalog });
    expect(all.map((row) => [row.kind, row.title])).toEqual([
      ['connector', 'Scientific viewer'],
      ['connector', 'Home hub'],
      ['connector', 'Structure viewer'],
      ['connector', 'My server'],
      ['plugin', 'tools'],
    ]);
    const [shown, off, plain, mine] = all;
    expect(shown!.meta.map((part) => part.text)).toEqual([
      'Plugin',
      '12 skills, 1 MCP server (13 tools)',
    ]);
    // The tool count is in what it brings; the state does not repeat it.
    expect(shown!.status).toEqual({ tone: 'success', label: 'Ready' });
    expect(off!.meta.map((part) => part.text)).toEqual(['Plugin', '2 skills, 1 MCP server']);
    expect(off!.needs).toBe('Needs hub address and access token');
    expect(off!.status?.label).toBe('Not enabled');
    expect(plain!.meta.map((part) => part.text)).toEqual(['Connector', '1 MCP server (4 tools)']);
    expect(mine!.meta.map((part) => part.text)).toEqual([
      'Connector',
      '1 MCP server (5 tools)',
      'Added by you',
    ]);
    const pluginsTab = extensionEntries({ ...base, type: 'plugins', connectors: catalog });
    expect(pluginsTab.map((row) => row.title)).toEqual(['Scientific viewer', 'Home hub', 'tools']);
    const connectorsTab = extensionEntries({ ...base, type: 'mcp', connectors: catalog });
    expect(connectorsTab.map((row) => row.title)).toEqual(['Structure viewer', 'My server']);
    const search = extensionEntries({ ...base, type: 'all', connectors: [home], term: 'sensors' });
    expect(search.map((row) => row.title)).toEqual(['Home hub']);
  });

  it('shows its skills and its MCP server in the pane, and opens a skill', async () => {
    const user = userEvent.setup();
    const onViewSkill = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <ConnectorPane
            connector={home}
            onClose={vi.fn()}
            onSignIn={vi.fn()}
            onViewSkill={onViewSkill}
            plugin={bundlingPlugin(home, plugins)}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    const section = screen.getByRole('region', { name: 'What it brings' });
    expect(section.textContent).toContain(
      'A plugin with 2 skills and 1 MCP server. Adding it to a conversation brings both.',
    );
    expect(section.textContent).toContain('Home hub, tools listed once enabled');
    expect(section.textContent).toContain('clio/home');
    await user.click(within(section).getByRole('button', { name: 'home-sensors' }));
    expect(onViewSkill).toHaveBeenCalledWith(bundlingPlugin(home, plugins), 'home-sensors');
    // The connector's part stays: its needs and enabling it.
    expect(screen.getByLabelText('Hub address')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enable' })).toBeTruthy();
  });

  it('shows a connector as a connector in the pane, with no plugin section', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <ConnectorPane connector={structures} onClose={vi.fn()} onSignIn={vi.fn()} />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('region', { name: 'What it brings' })).toBeNull();
    const card = document.querySelector('[data-slot="connector-setup-card"]')!;
    expect(card.textContent).toContain('Connector (an MCP server)');
    expect(card.textContent).toContain('Ready, 4 tools');
  });
});

describe('Discover lists the catalog entries that are off, each as what it is', () => {
  beforeEach(() => {
    repository.capabilities.mockResolvedValue({
      capabilities: { x_clio_agent_plugins: true, x_clio_extension_library: true },
      gact_versions: [],
    });
    repository.plugins.mockResolvedValue({ plugins, default_marketplace_error: null });
    repository.connectors.mockResolvedValue([viewer, home, { ...structures, enabled: false }]);
  });

  it('shows Home hub as a plugin and the viewer as a connector, and no hard-coded suggestion', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <TooltipProvider>
            <ExtensionLibrary />
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole('group', { name: 'Extensions' }, { timeout: 10_000 });
    await user.click(screen.getByRole('radio', { name: 'Discover' }));
    const list = await screen.findByRole('group', { name: 'Plugins and connectors to enable' });
    expect(list.textContent).toContain('Home hub');
    expect(list.textContent).toContain('Plugin2 skills, 1 MCP server');
    expect(list.textContent).toContain('Structure viewer');
    expect(list.textContent).toContain('Connector1 MCP server');
    expect(list.textContent).not.toContain('Scientific viewer');
    expect(screen.queryByText('Home Assistant skills')).toBeNull();
    expect(screen.queryByText('Home Assistant MCP')).toBeNull();
    expect(screen.getByText('Bring your own plugin')).toBeTruthy();
    expect(screen.getByText('Bring your own skills')).toBeTruthy();
  });
});

describe('a change waiting for compaction names what changed as the person knows it', () => {
  it('reads a connector by its name, never its carrier id (PL-D1)', () => {
    const names: Record<string, string> = {
      'connector-structures': 'Structure viewer',
      home: 'Home hub',
    };
    render(
      <PluginChangePendingNotice
        basis={{ pending: true, added: ['connector-structures', 'home'], removed: [] } as never}
        compacting={false}
        nameOf={(id) => names[id] ?? id}
      />,
    );
    const notice = screen.getByRole('region', { name: 'Plugin changes waiting for compaction' });
    expect(notice.textContent).toContain('Structure viewer, Home hub');
    expect(notice.textContent).not.toContain('connector-structures');
  });
});
