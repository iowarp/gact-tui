import { pluginEntrySchema, toolSettingsSchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PluginToolSettings } from './plugin-tool-settings';
import { ToolsSettingsTabs } from './settings-tools-tabs';

const repository = vi.hoisted(() => ({
  toolSettings: vi.fn(),
  updateToolSettings: vi.fn(),
  removeToolRule: vi.fn(),
}));
const catalog = vi.hoisted(() => ({
  supported: true as boolean | undefined,
  result: {} as Record<string, unknown>,
}));
// The Tools tab reads a plugin's settings once its group comes into view. By default every
// observed group reports itself in view at once; a test can hold them all out of view.
const viewport = vi.hoisted(() => ({ inView: true }));
class InViewObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    if (!viewport.inView) return;
    const entry = { isIntersecting: true, target } as unknown as IntersectionObserverEntry;
    queueMicrotask(() => this.callback([entry], this as unknown as IntersectionObserver));
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://test' } }),
}));
vi.mock('@/hooks/use-session-agent', () => ({
  useAgentPluginsSupported: () => catalog.supported,
  usePluginCatalog: () => catalog.result,
}));

const outcomes = (direct: string, script: string) =>
  Object.fromEntries(['ask', 'auto-edits', 'bypass'].map((mode) => [mode, { direct, script }]));

const VIEW = toolSettingsSchema.parse({
  plugin: 'clio-builtin/home',
  approval_modes: ['ask', 'auto-edits', 'bypass'],
  covering_modes: ['auto-edits'],
  servers_not_loaded: ['calendar'],
  tools: [
    {
      name: 'home_light_list',
      kind: 'mcp',
      server: 'home',
      description: 'List the lights.',
      read_only: true,
      destructive: false,
      group: 'read',
      plugin_permission: 'allow',
      plugin_permission_source: 'annotations',
      rules: [],
      permission: '',
      plugin_callers: 'both',
      callers: 'both',
      outcomes: outcomes('runs', 'runs'),
    },
    {
      name: 'home_light_set',
      kind: 'mcp',
      server: 'home',
      description: 'Prefer scenes for several lights.',
      read_only: false,
      destructive: true,
      group: 'write',
      plugin_permission: 'ask',
      plugin_permission_source: 'plugin',
      rules: [
        {
          scope: 'session',
          scope_id: 'sess_1',
          where: 'session',
          action: 'allow_session',
          path_pattern: '',
        },
      ],
      permission: '',
      plugin_callers: 'code',
      configured_callers: '',
      callers: 'code',
      outcomes: outcomes('unavailable', 'asks'),
    },
  ],
});

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  return render(
    <QueryClientProvider client={client()}>
      <PluginToolSettings reference="clio-builtin/home" />
    </QueryClientProvider>,
  );
}

function Where() {
  const location = useLocation();
  return <output aria-label="Route">{location.pathname}</output>;
}

function TabsPage() {
  const { section = '' } = useParams();
  return (
    <ToolsSettingsTabs
      key={section}
      remote={<p>Remote tools page</p>}
      section={section}
      tools={<p>MCP servers page</p>}
    />
  );
}

function renderTabs(path: string, children?: ReactNode) {
  return render(
    <QueryClientProvider client={client()}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              element={
                <>
                  <TabsPage />
                  <Where />
                </>
              }
              path="/settings/:section"
            />
          </Routes>
          {children}
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

// Parsed as the repository returns them: every contribution list is present.
const PLUGINS = [
  {
    ref: 'clio-builtin/home',
    id: 'home',
    description: 'Home lights',
    tools: ['home_light_list', 'home_light_set'],
    mcp_servers: ['home', 'calendar'],
  },
  { ref: 'clio-builtin/empty', id: 'empty-pack', description: '' },
  { ref: 'clio-builtin/postgres', id: 'postgres-tools', description: '', mcp_servers: ['postgres'] },
].map((plugin) => pluginEntrySchema.parse(plugin));

beforeEach(() => {
  viewport.inView = true;
  vi.stubGlobal('IntersectionObserver', InViewObserver);
  repository.toolSettings.mockImplementation(async (ref: string) => {
    if (ref === 'clio-builtin/home') return VIEW;
    return {
      ...VIEW,
      plugin: ref,
      tools: [],
      servers_not_loaded: ref === 'clio-builtin/postgres' ? ['postgres'] : [],
    };
  });
  repository.updateToolSettings.mockResolvedValue({ tools: [] });
  repository.removeToolRule.mockResolvedValue({ removed: 1 });
  catalog.supported = true;
  catalog.result = {
    data: { plugins: PLUGINS },
    error: null,
    isPending: false,
    refetch: vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('groups tools by their flags and states defaults and outcomes in words', async () => {
  renderPage();
  const read = await screen.findByRole('region', { name: 'Read-only tools' });
  const write = screen.getByRole('region', { name: 'Write and delete tools' });
  expect(within(read).getByText('home_light_list')).toBeVisible();
  expect(within(read).getByTitle(/read-only tools run without asking/u)).toBeVisible();
  expect(within(write).getAllByText('Destructive').length).toBeGreaterThan(0);
  expect(within(write).getByText('Rule: allowed in one conversation')).toBeVisible();
  // The mode's outcome and the script's outcome, each a mark with a word.
  expect(within(write).getAllByText("Agent can't call it").length).toBeGreaterThan(0);
  expect(within(write).getAllByText('Asks you').length).toBeGreaterThan(0);
  expect(screen.getByText('Not loaded yet')).toBeVisible();
  expect(screen.getAllByTitle(/Tools of calendar appear here/u).length).toBeGreaterThan(0);
  // Each control shows the value in force; a default carries its mark in words.
  const permission = within(write).getByRole('combobox', { name: 'Permission: home_light_set' });
  expect(permission).toHaveTextContent('Needs approval, default');
  const io = within(write).getByRole('combobox', { name: 'I/O: home_light_set' });
  expect(io).toHaveTextContent('Code, default');
  // No declaration: the flags and the mode decide, so a read-only tool reads as allowed.
  const list = within(read).getByRole('combobox', { name: 'Permission: home_light_list' });
  expect(list).toHaveTextContent('Always allow, default');
  expect(
    screen.getByText('Choices save at once. A \u2713 shows for 2 s, an error stays on the row.'),
  ).toBeVisible();
}, 15_000);

it('saves a per-tool block and confirms it on the row', async () => {
  const user = userEvent.setup();
  renderPage();
  const write = await screen.findByRole('region', { name: 'Write and delete tools' });
  await user.click(within(write).getByRole('combobox', { name: 'Permission: home_light_set' }));
  await user.click(await screen.findByRole('option', { name: /^Blocked/u }));
  expect(repository.updateToolSettings).toHaveBeenCalledWith({
    tools: ['home_light_set'],
    permission: 'deny',
  });
  expect(await within(write).findByRole('status', { name: 'Saved' })).toBeInTheDocument();
}, 15_000);

it('sets a whole group at once and removes a saved rule', async () => {
  const user = userEvent.setup();
  renderPage();
  const write = await screen.findByRole('region', { name: 'Write and delete tools' });
  await user.click(screen.getByRole('combobox', { name: 'I/O: All read-only tools' }));
  await user.click(await screen.findByRole('option', { name: /^Direct/u }));
  expect(repository.updateToolSettings).toHaveBeenCalledWith({
    tools: ['home_light_list'],
    callers: 'direct',
  });
  await user.click(within(write).getByRole('button', { name: 'More for home_light_set' }));
  await user.click(
    await screen.findByRole('menuitem', { name: 'Remove rule: Allowed in one conversation' }),
  );
  expect(repository.removeToolRule).toHaveBeenCalledWith(
    'home_light_set',
    expect.objectContaining({ scope: 'session', scope_id: 'sess_1', action: 'allow_session' }),
  );
}, 15_000);

it("choosing a tool's default value clears the choice instead of saving a copy", async () => {
  const user = userEvent.setup();
  renderPage();
  const write = await screen.findByRole('region', { name: 'Write and delete tools' });
  await user.click(within(write).getByRole('combobox', { name: 'I/O: home_light_set' }));
  const choice = await screen.findByRole('option', { name: /^Code/u });
  expect(choice).toHaveTextContent('Default');
  await user.click(screen.getByRole('option', { name: /^Both/u }));
  expect(repository.updateToolSettings).toHaveBeenLastCalledWith({
    tools: ['home_light_set'],
    callers: 'both',
  });
}, 15_000);

it('keeps a failed save on its row', async () => {
  const user = userEvent.setup();
  repository.updateToolSettings.mockRejectedValue(new Error('Agent is offline'));
  renderPage();
  const write = await screen.findByRole('region', { name: 'Write and delete tools' });
  await user.click(within(write).getByRole('combobox', { name: 'Permission: home_light_set' }));
  await user.click(await screen.findByRole('option', { name: /^Always allow/u }));
  expect(await within(write).findByRole('alert')).toHaveTextContent('Not saved: Agent is offline');
}, 15_000);

it('changes the outcome column with the approval mode', async () => {
  const user = userEvent.setup();
  repository.toolSettings.mockResolvedValue({
    ...VIEW,
    tools: VIEW.tools.map((tool) =>
      tool.name === 'home_light_set'
        ? {
            ...tool,
            outcomes: { ...tool.outcomes, 'auto-edits': { direct: 'runs', script: 'covered' } },
          }
        : tool,
    ),
  });
  renderPage();
  await screen.findByRole('region', { name: 'Write and delete tools' });
  expect(screen.getByText('In Ask first')).toBeInTheDocument();
  await user.click(screen.getByRole('combobox', { name: 'Outcomes in' }));
  await user.click(await screen.findByRole('option', { name: /^Workspace edits/u }));
  expect(screen.getByText('In Workspace edits')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Outcomes in' })).toHaveTextContent(
    'Workspace edits',
  );
  const write = screen.getByRole('region', { name: 'Write and delete tools' });
  expect(within(write).getAllByText('Covered').length).toBeGreaterThan(0);
}, 15_000);

it('shows a choice the person made as blocked, without the default mark', async () => {
  repository.toolSettings.mockResolvedValue({
    ...VIEW,
    tools: VIEW.tools.map((tool) =>
      tool.name === 'home_light_list' ? { ...tool, permission: 'deny' as const } : tool,
    ),
  });
  renderPage();
  const read = await screen.findByRole('region', { name: 'Read-only tools' });
  const control = within(read).getByRole('combobox', { name: 'Permission: home_light_list' });
  expect(control).toHaveTextContent('Blocked');
  expect(control).not.toHaveTextContent('default');
  expect(within(control).queryByText('D')).toBeNull();
  expect(within(read).getAllByText('Blocked by you').length).toBeGreaterThan(0);
});

it('says when the settings cannot be read', async () => {
  repository.toolSettings.mockRejectedValue(new Error('Plugin is not installed'));
  renderPage();
  expect(await screen.findByText('Tool settings couldn’t be loaded.')).toBeVisible();
  expect(screen.getByTitle('Plugin is not installed')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
});

it("lists every plugin's tools on the Tools tab and sets a plugin at once", async () => {
  const user = userEvent.setup();
  renderTabs('/settings/tool-permissions');
  expect(screen.getByRole('heading', { name: 'Tools and MCP servers' })).toBeVisible();
  const home = await screen.findByRole('region', { name: 'home' });
  expect((await within(home).findAllByText('home server')).length).toBeGreaterThan(0);
  expect(within(home).getByText('2 tools')).toBeVisible();
  expect(screen.queryByRole('region', { name: 'empty-pack' })).toBeNull();
  const postgres = screen.getByRole('region', { name: 'postgres-tools' });
  expect(within(postgres).getByText('Not loaded yet')).toBeVisible();
  expect(
    within(postgres).getByText('Tools appear once a conversation connects its server'),
  ).toBeVisible();
  await user.click(screen.getByRole('combobox', { name: 'Permission: All home tools' }));
  await user.click(await screen.findByRole('option', { name: /^Needs approval/u }));
  expect(repository.updateToolSettings).toHaveBeenCalledWith({
    tools: ['home_light_list', 'home_light_set'],
    permission: 'ask',
  });
}, 15_000);

it('lays a group out from the catalog and reads its settings only once it comes into view', async () => {
  viewport.inView = false;
  renderTabs('/settings/tool-permissions');
  const home = await screen.findByRole('region', { name: 'home' });
  expect(within(home).getByText('Loading')).toBeVisible();
  expect(screen.getByRole('region', { name: 'postgres-tools' })).toBeVisible();
  expect(repository.toolSettings).not.toHaveBeenCalled();
});

it('filters the Tools tab from the / key', async () => {
  const user = userEvent.setup();
  renderTabs('/settings/tool-permissions');
  await screen.findByRole('region', { name: 'home' });
  await user.keyboard('/');
  const filter = screen.getByRole('searchbox', { name: 'Filter tools' });
  expect(filter).toHaveFocus();
  fireEvent.change(filter, { target: { value: 'light_set' } });
  expect(screen.queryByText('home_light_list')).toBeNull();
  expect(screen.getByText('home_light_set')).toBeVisible();
  expect(screen.queryByRole('region', { name: 'postgres-tools' })).toBeNull();
  fireEvent.change(filter, { target: { value: 'nothing-here' } });
  expect(screen.getByText('No tools match “nothing-here”.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Clear filter' }));
  expect(screen.getByText('home_light_list')).toBeVisible();
});

it('says when no plugin brings tools, or the plugins cannot be listed', async () => {
  catalog.result = { data: { plugins: [] }, error: null, isPending: false, refetch: vi.fn() };
  const { unmount } = renderTabs('/settings/tool-permissions');
  expect(
    await screen.findByText('No plugin tools yet. Extensions that bring tools list them here.'),
  ).toBeVisible();
  expect(screen.queryByRole('searchbox', { name: 'Filter tools' })).toBeNull();
  unmount();
  const refetch = vi.fn();
  catalog.result = {
    data: undefined,
    error: new Error('Agent is offline'),
    isPending: false,
    refetch,
  };
  renderTabs('/settings/tool-permissions');
  expect(screen.getByText('Plugin tools couldn’t be loaded.')).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
  expect(refetch).toHaveBeenCalled();
});

it('makes each tab its own route and keeps focus on the switch', async () => {
  const user = userEvent.setup();
  renderTabs('/settings/tools');
  expect(screen.getByText('MCP servers page')).toBeVisible();
  // jsdom has no container queries; act on the full fold of the page switch.
  const full = within(document.querySelector<HTMLElement>('[data-fold="full"]')!);
  const servers = full.getByRole('radio', { name: 'MCP servers' });
  expect(servers).toHaveAttribute('data-state', 'on');
  await user.click(full.getByRole('radio', { name: 'Remote tools' }));
  expect(screen.getByRole('status', { name: 'Route' })).toHaveTextContent('/settings/relays');
  expect(screen.getByText('Remote tools page')).toBeVisible();
  const remote = within(document.querySelector<HTMLElement>('[data-fold="full"]')!);
  expect(remote.getByRole('radio', { name: 'Remote tools' })).toHaveFocus();
  await user.click(remote.getByRole('radio', { name: 'Tools' }));
  expect(screen.getByRole('status', { name: 'Route' })).toHaveTextContent(
    '/settings/tool-permissions',
  );
  expect(await screen.findByRole('group', { name: 'Plugin tools' })).toBeVisible();
});

it('reaches the other pages from the folded switch', async () => {
  const user = userEvent.setup();
  renderTabs('/settings/tools');
  const folded = within(document.querySelector<HTMLElement>('[data-fold="current"]')!);
  expect(folded.getAllByRole('radio')).toHaveLength(1);
  await user.click(folded.getByRole('button', { name: 'Other Tools pages' }));
  await user.click(await screen.findByRole('menuitemradio', { name: 'Remote tools' }));
  expect(screen.getByRole('status', { name: 'Route' })).toHaveTextContent('/settings/relays');
});

it('names every page in text, as the spec segment does', () => {
  renderTabs('/settings/tools');
  expect(document.querySelector('[data-fold="icons"]')).toBeNull();
  const full = within(document.querySelector<HTMLElement>('[data-fold="full"]')!);
  for (const name of ['Tools', 'MCP servers', 'Remote tools'])
    expect(full.getByRole('radio', { name })).toHaveTextContent(name);
  expect(document.querySelector('[data-fold="full"] svg')).toBeNull();
});

it('a summary row opens one picker for both choices and keeps the reason', async () => {
  const user = userEvent.setup();
  renderPage();
  const write = await screen.findByRole('region', { name: 'Write and delete tools' });
  // The sub line: the values a summary row shows, the outcomes, then the reason.
  expect(within(write).getByText('Rule: allowed in one conversation')).toBeInTheDocument();
  await user.click(
    within(write).getByRole('button', { name: 'Permission and I/O: home_light_set' }),
  );
  await user.click(await screen.findByRole('option', { name: /^Both/u }));
  expect(repository.updateToolSettings).toHaveBeenLastCalledWith({
    tools: ['home_light_set'],
    callers: 'both',
  });
  await user.click(
    within(write).getByRole('button', { name: 'Permission and I/O: home_light_set' }),
  );
  await user.click(await screen.findByRole('option', { name: /^Blocked/u }));
  expect(repository.updateToolSettings).toHaveBeenLastCalledWith({
    tools: ['home_light_set'],
    permission: 'deny',
  });
}, 15_000);

it("a group's summary row sets the whole group", async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByRole('region', { name: 'Read-only tools' });
  await user.click(screen.getByRole('button', { name: 'Permission and I/O: All read-only tools' }));
  await user.click(await screen.findByRole('option', { name: /^Direct/u }));
  expect(repository.updateToolSettings).toHaveBeenCalledWith({
    tools: ['home_light_list'],
    callers: 'direct',
  });
}, 15_000);
