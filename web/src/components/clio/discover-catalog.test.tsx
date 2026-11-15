import { connectorSchema, pluginEntrySchema, type Connector } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

const repository = vi.hoisted(() => ({
  pluginMarketplaces: vi.fn(async () => []),
  capabilities: vi.fn(),
  plugins: vi.fn(),
  connectors: vi.fn(),
  enableConnector: vi.fn(),
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
  cardNeedsWords,
  cardRequiresWords,
  cardSourceWords,
  discoverCardAction,
} from '@/lib/discover-card';
import { vocab } from '@/lib/brand-vocabulary';
import { ExtensionLibrary } from './extension-library';

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

/** A large synthetic catalog: one group of six clio-kit servers, a plugin with needs. */
const formats = Array.from({ length: 6 }, (_, index) =>
  connector({
    id: `format-${index + 1}`,
    name: `Format ${index + 1}`,
    description: `Read and write format ${index + 1} files, with a long description that runs on to a second line and is cut there.`,
    group: 'Data formats',
    kit: `format-${index + 1}`,
  }),
);
const home = connector({
  id: 'home',
  name: 'Home hub',
  group: 'Home and devices',
  plugin: 'home',
  plugin_ref: 'clio/home',
  state: { status: 'needs', needs: ['url', 'token'] },
  needs: [
    { key: 'url', kind: 'address', label: 'Hub address', required: true },
    { key: 'token', kind: 'secret', label: 'Access token', required: true },
  ],
});
const printer = connector({
  id: 'printer',
  name: 'Printer slicer',
  group: 'Home and devices',
  requires: 'Needs a slicer installed on this machine.',
});
const viewer = connector({
  id: 'viewer',
  name: 'Scientific viewer',
  group: 'Analysis and plots',
  enabled: true,
  tool_count: 13,
});
const plugins = [
  pluginEntrySchema.parse({
    id: 'home',
    ref: 'clio/home',
    marketplace: 'clio',
    trusted: true,
    description: 'Read the home hub',
    skills: ['home-best-practices', 'home-sensors'],
    mcp_servers: ['home'],
    follows: 'home',
    connector: { id: 'home', name: 'Home hub', enabled: false },
  }),
];

function renderLibrary() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <TooltipProvider>
          <ExtensionLibrary />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openDiscover() {
  const user = userEvent.setup();
  renderLibrary();
  await screen.findByRole('group', { name: 'Extensions' }, { timeout: 10_000 });
  await user.click(screen.getByRole('radio', { name: 'Discover' }));
  const catalog = await screen.findByRole('group', { name: 'Catalog plugins and connectors' });
  return { user, catalog };
}

const card = (name: string) =>
  screen.getByRole('article', { name }) as HTMLElement;

// Each test renders the whole Extensions library; on a loaded machine that alone can take
// several seconds, so these get more than the default five.
describe('Discover cards (DC)', { timeout: 20_000 }, () => {
  let rows: Connector[];
  beforeEach(() => {
    rows = [...formats, home, printer, viewer];
    repository.capabilities.mockResolvedValue({
      capabilities: { x_clio_agent_plugins: true, x_clio_extension_library: true },
      gact_versions: [],
    });
    repository.plugins.mockResolvedValue({ plugins, default_marketplace_error: null });
    repository.connectors.mockImplementation(async () => rows);
  });

  it('shows Enable on an off card; enabling says what it does, then Enabled with its check', async () => {
    let finish: (value: Connector) => void = () => undefined;
    repository.enableConnector.mockImplementation(
      () => new Promise<Connector>((resolve) => (finish = resolve)),
    );
    const { user } = await openDiscover();
    const first = card('Format 1');
    expect(within(first).getByText('From clio-kit')).toBeTruthy();
    // The description is two lines at most, its whole text on hover.
    const description = first.querySelector('[data-slot="discover-card-description"]')!;
    expect(description.className).toContain('line-clamp-2');
    await user.click(within(first).getByRole('button', { name: 'Enable' }));
    expect(repository.enableConnector).toHaveBeenCalledWith('format-1');
    expect((await within(first).findByRole('status')).textContent).toBe('Downloading its tools…');
    const enabled = { ...formats[0]!, enabled: true, tool_count: 4 };
    rows = rows.map((row) => (row.id === 'format-1' ? enabled : row));
    finish(enabled);
    await waitFor(() => expect(within(card('Format 1')).getByText('Enabled')).toBeTruthy());
    // The word goes with the check; the + is gone.
    expect(within(card('Format 1')).queryByRole('button', { name: 'Enable' })).toBeNull();
    expect(card('Format 1').querySelector('svg.lucide-check')).toBeTruthy();
  });

  it('opens the setup pane for an entry with needs, and enables nothing yet', async () => {
    const { user } = await openDiscover();
    const hub = card('Home hub');
    expect(within(hub).getByText('Needs hub address and access token')).toBeTruthy();
    expect(within(hub).getByText('Plugin')).toBeTruthy();
    expect(within(hub).getByText('2 skills, 1 MCP server')).toBeTruthy();
    await user.click(within(hub).getByRole('button', { name: 'Enable' }));
    expect(repository.enableConnector).not.toHaveBeenCalled();
    const pane = document.querySelector('[data-slot="connector-setup-card"]') as HTMLElement;
    expect(pane.dataset.connector).toBe('home');
    expect(screen.getByLabelText('Hub address')).toBeTruthy();
    expect(hub.getAttribute('aria-current')).toBe('true');
  });

  it('opens the pane from the card body', async () => {
    const { user } = await openDiscover();
    await user.click(within(card('Scientific viewer')).getByRole('button', { name: 'Scientific viewer' }));
    const pane = document.querySelector('[data-slot="connector-setup-card"]') as HTMLElement;
    expect(pane.dataset.connector).toBe('viewer');
    expect(within(pane).getByRole('button', { name: 'Turn off' })).toBeTruthy();
  });

  it('shows a long group’s first four cards and Show all, with counts in the headings', async () => {
    const { user, catalog } = await openDiscover();
    const group = within(catalog).getByRole('region', { name: 'Data formats (6)' });
    expect(within(group).getAllByRole('article')).toHaveLength(4);
    await user.click(within(group).getByRole('button', { name: /^Show all \(6\)/ }));
    expect(within(group).getAllByRole('article')).toHaveLength(6);
    expect(within(group).getByRole('button', { name: 'Show fewer' })).toBeTruthy();
    // A short group has no link.
    const devices = within(catalog).getByRole('region', { name: 'Home and devices (2)' });
    expect(within(devices).queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('narrows the cards with the search, every match shown', async () => {
    const { user } = await openDiscover();
    await user.type(screen.getByLabelText('Search extensions'), 'format');
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Home hub' })).toBeNull());
    expect(screen.getAllByRole('article')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('keeps one plain search field beside the tabs, with a clear button only while it has text', async () => {
    const { user } = await openDiscover();
    const field = screen.getByLabelText('Search extensions') as HTMLInputElement;
    expect(field.placeholder).toBe('Search plugins, connectors and skills');
    expect(document.body.textContent).not.toContain('Enter for the registry');
    // Its own full-width line where the list is narrow, beside the tabs where it is wide.
    const form = field.closest('form')!;
    expect(form.className).toContain('basis-full');
    expect(form.className).toContain('@[52rem]/ext:flex-1');
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    await user.type(field, 'hub');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(field.value).toBe('');
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(1);
  });

  it('searches the MCP Registry only when asked: its row, or Enter', async () => {
    const { user } = await openDiscover();
    const field = screen.getByLabelText('Search extensions');
    await user.type(field, 'hdf');
    const row = await screen.findByRole('button', { name: 'Search the MCP Registry for “hdf”' });
    expect(repository.discoverMcp).not.toHaveBeenCalledWith('hdf', expect.anything(), expect.anything());
    await user.click(row);
    await waitFor(() =>
      expect(repository.discoverMcp).toHaveBeenCalledWith('hdf', '', expect.anything()),
    );
    expect(screen.queryByRole('button', { name: /Search the MCP Registry/ })).toBeNull();
    // A new query offers the row again; Enter does the same as the row.
    await user.type(field, '5');
    expect(screen.getByRole('button', { name: 'Search the MCP Registry for “hdf5”' })).toBeTruthy();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(repository.discoverMcp).toHaveBeenCalledWith('hdf5', '', expect.anything()),
    );
  });

  it('draws Enable as a 32 px circle around a 16 px plus', async () => {
    await openDiscover();
    const button = within(card('Format 1')).getByRole('button', { name: 'Enable' });
    expect(button.className).toContain('size-8');
    expect(button.className).toContain('rounded-full');
    expect(button.className).not.toMatch(/(^|\s)size-7(\s|$)/);
    expect(button.querySelector('svg')!.getAttribute('class')).toContain('size-4');
  });

  it('lays out one column on a phone and two where the list is wide', async () => {
    const { catalog } = await openDiscover();
    const grid = catalog.querySelector('[data-slot="discover-grid"]')!;
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('@xl/ext:grid-cols-2');
  });

  it('shows what must already be on this machine', async () => {
    await openDiscover();
    const slicer = card('Printer slicer');
    expect(slicer.querySelector('[data-slot="discover-card-requires"]')!.textContent).toBe(
      'On this machine Needs a slicer installed on this machine.',
    );
    expect(within(slicer).getByText(`From the ${vocab.agent} catalog`)).toBeTruthy();
  });
});

describe('a Discover card’s words', () => {
  it('names its action and state in words for each case', () => {
    expect(discoverCardAction(formats[0]!)).toEqual({ kind: 'enable' });
    expect(discoverCardAction(formats[0]!, 'starting')).toEqual({
      kind: 'busy',
      words: 'Downloading its tools…',
    });
    expect(discoverCardAction(printer, 'starting')).toEqual({ kind: 'busy', words: 'Starting…' });
    expect(discoverCardAction(viewer, 'turning-off')).toEqual({
      kind: 'busy',
      words: 'Turning off…',
    });
    expect(discoverCardAction(home)).toEqual({
      kind: 'setup',
      needs: 'Needs hub address and access token',
    });
    expect(discoverCardAction(viewer)).toEqual({ kind: 'enabled' });
    const unreachable = connector({
      id: 'far',
      name: 'Far',
      enabled: true,
      state: { status: 'unreachable', needs: [], reason: 'Nothing answered' },
    });
    expect(discoverCardAction(unreachable)).toMatchObject({
      kind: 'state',
      status: { label: 'Can’t be reached', tone: 'error' },
    });
  });

  it('says where it comes from and what it needs', () => {
    expect(cardSourceWords(formats[0]!)).toBe('From clio-kit');
    expect(cardSourceWords(home, plugins[0], 'clio')).toBe(`From the ${vocab.agent} catalog`);
    expect(cardSourceWords(home, { marketplace: 'lab-tools' }, 'clio')).toBe('From lab-tools');
    expect(cardSourceWords({ kit: null, source: 'custom' })).toBe('Added by you');
    expect(cardNeedsWords({ ...home, enabled: true })).toBe('');
    expect(cardRequiresWords({ ...printer, enabled: true })).toBe('');
    expect(cardRequiresWords(viewer)).toBe('');
  });
});
