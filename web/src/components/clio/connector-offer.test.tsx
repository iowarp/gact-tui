import {
  connectorSchema,
  pluginEntrySchema,
  type Connector,
  type PendingInteraction,
  type PluginEntry,
} from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  connectors: vi.fn(),
  sessionConnector: vi.fn(),
  connectorLogo: vi.fn(),
  capabilities: vi.fn(async () => ({ capabilities: { x_clio_agent_plugins: true } })),
  agents: vi.fn(async () => []),
  plugins: vi.fn(async () => ({ plugins: [] as PluginEntry[], default_marketplace_error: null })),
  inspectPlugin: vi.fn(),
  mcpServers: vi.fn(async () => []),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

import { TooltipProvider } from '@/components/ui/tooltip';
import { ConversationInteractionActivity } from './conversation-interaction-activity';
import { ClioPendingInteractions } from './pending-interactions';

const viewer = (value: Partial<Record<string, unknown>> = {}): Connector =>
  connectorSchema.parse({
    id: 'fixture-viewer',
    name: 'Fixture viewer for very large scientific datasets on another machine',
    description: 'Open scientific data on this machine or another, and see it in a tab',
    logo_url: null,
    source: 'catalog',
    enabled: false,
    tool_count: null,
    state: { status: 'ready', needs: [], reason: null },
    needs: [
      { key: 'address', kind: 'address', label: 'Where it runs', required: false },
      { key: 'token', kind: 'secret', label: 'Access token', required: true },
    ],
    ...value,
  });

const offer: PendingInteraction = {
  id: 'connector:abc',
  kind: 'connector_setup',
  owner_session_id: 'sess_root',
  attended_session_id: 'sess_root',
  status: 'pending',
  title: 'Add Fixture viewer to this conversation',
  prompt: 'The agent offers Fixture viewer: Show the dataset in 3D.',
  source: { protocol: 'mcp', tool_name: 'offer_plugin', invocation_id: 'call_1' },
  created_at: '2026-11-13T00:00:00Z',
  payload: {
    connector_id: 'fixture-viewer',
    connector_name: 'Fixture viewer for very large scientific datasets on another machine',
    tool_name: 'offer_plugin',
    intent: 'enable',
    description: 'Open scientific data on this machine or another, and see it in a tab',
    reason: 'You asked to see the dataset in 3D; this connector opens it in a live view.',
    agent_ref: 'clio/standard',
    agent_name: 'Standard',
    asks_sign_in: true,
    missing: [
      { key: 'address', kind: 'address', label: 'Where it runs', required: false },
      { key: 'token', kind: 'secret', label: 'Access token', required: true },
    ],
  },
  actions: ['submit', 'decline'],
};

function renderWith(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>,
  );
}

function renderDock(onResponse = vi.fn(async () => undefined)) {
  renderWith(
    <ClioPendingInteractions
      interactions={[offer]}
      onResponse={onResponse}
      viewedSessionId="sess_root"
    />,
  );
  return onResponse;
}

beforeEach(() => {
  repository.connectors.mockResolvedValue([viewer()]);
  repository.sessionConnector.mockImplementation(async (id: string) =>
    ((await repository.connectors()) as Connector[]).find((row) => row.id === id),
  );
  repository.connectorLogo.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"/>');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the agent offers to add a connector to this conversation', () => {
  it('says what must already be on this machine until the connector is on (SL-D8)', async () => {
    const requires = 'Needs the viewer program installed on this machine.';
    repository.connectors.mockResolvedValue([viewer({ requires })]);
    renderDock();
    const line = await screen.findByRole('button', { name: requires });
    expect(line.getAttribute('data-slot')).toBe('connector-offer-requires');
    expect(line.previousElementSibling?.textContent).toBe('On this machine');
    cleanup();
    repository.connectors.mockResolvedValue([viewer({ requires, enabled: true })]);
    renderDock();
    await screen.findByRole('button', { name: offer.payload!.description as string });
    expect(document.querySelector('[data-slot="connector-offer-requires"]')).toBeNull();
  });

  it('is four rows: the title with its state, what it is, why, then Add and what it brings', async () => {
    renderDock();
    expect(
      await screen.findByText(/Add Fixture viewer for very large.* to this conversation\?/u),
    ).toBeTruthy();
    // State in words, with what Add does when it is off.
    expect(screen.getByText('Not enabled')).toBeTruthy();
    expect(screen.getByText('(Add turns it on)')).toBeTruthy();
    // What it is: its own description on one line.
    const what = screen.getByRole('button', { name: offer.payload!.description as string });
    expect(what.getAttribute('data-slot')).toBe('connector-offer-description');
    expect(what.className).toContain('truncate');
    // Why: the agent's reason on one line, after a quiet "Why".
    const reason = screen.getByRole('button', { name: offer.payload!.reason as string });
    expect(reason.getAttribute('aria-expanded')).toBe('false');
    expect(reason.className).toContain('truncate');
    expect(reason.previousElementSibling?.textContent).toBe('Why');
    // What Add changes, in words: a connector is one MCP server.
    expect(document.querySelector('[data-slot="connector-offer-contents"]')?.textContent).toBe(
      'Brings 1 MCP server to this conversation',
    );
    // Still dropped: "Why the agent asks", "Nothing is required…", "Its tools join…".
    expect(screen.queryByText('Why the agent asks')).toBeNull();
    expect(screen.queryByText(/Nothing is required|needs nothing to set up/u)).toBeNull();
    expect(screen.queryByText(/join this conversation only/u)).toBeNull();
    // The required row shows; the optional one waits behind a quiet Settings (n).
    expect(screen.getByLabelText(/Access token/u)).toBeTruthy();
    expect(screen.queryByLabelText(/Where it runs/u)).toBeNull();
    const settings = screen.getByRole('button', { name: 'Settings (1)' });
    expect(settings.getAttribute('aria-expanded')).toBe('false');
    expect(settings.closest('[data-slot="ask-options"]')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    const add = screen.getByRole('button', { name: /^1?\s*Add$/u });
    expect(add.hasAttribute('disabled')).toBe(true);
    expect(add.getAttribute('title')).toContain('Adding turns');
    expect(add.getAttribute('title')).toContain('sign-in the first time');
  });

  it('opens the whole reason on click', async () => {
    const user = userEvent.setup();
    renderDock();
    const reason = await screen.findByRole('button', { name: offer.payload!.reason as string });
    await user.click(reason);
    expect(reason.getAttribute('aria-expanded')).toBe('true');
    expect(reason.className).not.toContain('truncate');
  });

  it('adds it to this conversation with the rows typed, sending no scope', async () => {
    const user = userEvent.setup();
    const onResponse = renderDock();
    await user.type(await screen.findByLabelText(/Access token/u), 'zz-token');
    await user.click(screen.getByRole('button', { name: 'Settings (1)' }));
    await user.type(screen.getByLabelText(/Where it runs/u), 'node08');
    await user.click(screen.getByRole('button', { name: /^1?\s*Add$/u }));
    expect(onResponse).toHaveBeenCalledWith(offer, {
      action: 'submit',
      values: { token: 'zz-token', address: 'node08' },
      metadata: { save_as_default: [], apply: 'note' },
    });
  });

  it('reads Enabled for a connector that is on, and shows no needs row when none is required', async () => {
    repository.connectors.mockResolvedValue([
      viewer({
        enabled: true,
        needs: [{ key: 'address', kind: 'address', label: 'Where it runs', required: false }],
      }),
    ]);
    const optionalOnly = {
      ...offer,
      payload: {
        ...offer.payload,
        asks_sign_in: false,
        missing: [{ key: 'address', kind: 'address', label: 'Where it runs', required: false }],
      },
    } as PendingInteraction;
    renderWith(
      <ClioPendingInteractions
        interactions={[optionalOnly]}
        onResponse={vi.fn(async () => undefined)}
        viewedSessionId="sess_root"
      />,
    );
    expect(await screen.findByText('Enabled')).toBeTruthy();
    expect(screen.queryByText(/Add turns it on/u)).toBeNull();
    expect(screen.queryByLabelText(/Access token/u)).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^1?\s*Add$/u }).hasAttribute('disabled')).toBe(
        false,
      ),
    );
  });

  it('keeps four rows when every required row is saved, with those rows in Settings (DOCS-F7)', async () => {
    const user = userEvent.setup();
    const needs = [
      {
        key: 'address',
        kind: 'address',
        label: 'Where it runs',
        required: true,
        value: 'https://lab.example',
        has_value: true,
      },
      { key: 'token', kind: 'secret', label: 'Access token', required: true, has_value: true },
      { key: 'mode', kind: 'value', label: 'Mode', required: false },
    ];
    repository.connectors.mockResolvedValue([viewer({ enabled: true, needs })]);
    const filled = {
      ...offer,
      payload: { ...offer.payload, asks_sign_in: false, missing: needs },
    } as PendingInteraction;
    const onResponse = vi.fn(async () => undefined);
    renderWith(
      <ClioPendingInteractions
        interactions={[filled]}
        onResponse={onResponse}
        viewedSessionId="sess_root"
      />,
    );
    // No input inline: the saved rows wait behind Settings with the optional one.
    expect(await screen.findByText('Enabled')).toBeTruthy();
    expect(document.querySelector('[data-slot="connector-need-rows"]')).toBeNull();
    const settings = screen.getByRole('button', { name: 'Settings (3)' });
    expect(settings.getAttribute('aria-expanded')).toBe('false');
    const add = screen.getByRole('button', { name: /^1?\s*Add$/u });
    await waitFor(() => expect(add.hasAttribute('disabled')).toBe(false));
    // Settings shows them, Required as they are, and keeps "Save as default".
    await user.click(settings);
    expect((screen.getByLabelText(/Where it runs/u) as HTMLInputElement).value).toBe(
      'https://lab.example',
    );
    expect(screen.getByLabelText(/Access token/u)).toBeTruthy();
    expect(screen.getAllByText('Required')).toHaveLength(2);
    await user.click(screen.getAllByRole('checkbox', { name: /Save as default/u })[0]!);
    await user.click(add);
    expect(onResponse).toHaveBeenCalledWith(filled, {
      action: 'submit',
      values: { address: 'https://lab.example' },
      metadata: { save_as_default: ['address'], apply: 'note' },
    });
  });

  it('shows inline only the required row still missing; the saved one is in Settings', async () => {
    const user = userEvent.setup();
    const needs = [
      {
        key: 'address',
        kind: 'address',
        label: 'Where it runs',
        required: true,
        value: 'https://lab.example',
        has_value: true,
      },
      { key: 'token', kind: 'secret', label: 'Access token', required: true },
    ];
    repository.connectors.mockResolvedValue([viewer({ needs })]);
    renderWith(
      <ClioPendingInteractions
        interactions={[
          { ...offer, payload: { ...offer.payload, missing: needs } } as PendingInteraction,
        ]}
        onResponse={vi.fn(async () => undefined)}
        viewedSessionId="sess_root"
      />,
    );
    const token = await screen.findByLabelText(/Access token/u);
    expect(screen.queryByLabelText(/Where it runs/u)).toBeNull();
    // Typing does not move the row: it stays inline while it is filled.
    await user.type(token, 'zz');
    expect(screen.getByLabelText(/Access token/u)).toBe(token);
    // Emptying the saved address in Settings keeps Settings open and Add waiting.
    await user.click(screen.getByRole('button', { name: 'Settings (1)' }));
    await user.clear(screen.getByLabelText(/Where it runs/u));
    await user.click(screen.getByRole('button', { name: 'Settings (1)' }));
    expect(screen.getByLabelText(/Where it runs/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^1?\s*Add$/u }).hasAttribute('disabled')).toBe(true);
  });

  it('says Not now', async () => {
    const user = userEvent.setup();
    const onResponse = renderDock();
    await user.click(await screen.findByRole('button', { name: /Not now/u }));
    expect(onResponse).toHaveBeenCalledWith(offer, { action: 'decline' });
  });

  it('reads "Add … to this conversation" in its line, waiting for you, then added or not now', () => {
    const { rerender } = renderWith(
      <ConversationInteractionActivity artifacts={{}} interaction={offer} />,
    );
    const line = () => document.querySelector('[data-slot="connector-setup-activity"]');
    expect(line()?.textContent).toContain('Add');
    expect(line()?.textContent).toContain('to this conversation');
    expect(screen.getByRole('button', { name: /Choose below/u }).textContent).toBe(
      'waiting for you',
    );
    for (const [status, words] of [
      ['answered', 'added'],
      ['denied', 'not now'],
    ] as const) {
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <TooltipProvider>
            <ConversationInteractionActivity artifacts={{}} interaction={{ ...offer, status }} />
          </TooltipProvider>
        </QueryClientProvider>,
      );
      expect(line()?.textContent).toContain(words);
    }
  });

  it('says how the plugin joins this turn, injection by default, and sends the choice', async () => {
    const user = userEvent.setup();
    const pluginOffer: PendingInteraction = {
      ...offer,
      id: 'connector:join',
      payload: {
        connector_id: '',
        connector_name: 'tariff-calc',
        tool_name: 'offer_plugin',
        intent: 'add_plugin',
        plugin_id: 'tariff-calc',
        plugin_ref: 'trade-lab/tariff-calc',
        reason: 'It computes duty.',
        missing: [],
      },
    };
    const onResponse = vi.fn(async () => undefined);
    renderWith(
      <ClioPendingInteractions
        interactions={[pluginOffer]}
        onResponse={onResponse}
        viewedSessionId="sess_root"
      />,
    );
    const join = await screen.findByRole('combobox', { name: 'How it joins this turn' });
    expect(join.textContent).toContain('Add as an injection');
    await user.click(join);
    await user.click(await screen.findByRole('option', { name: 'Add to the tool list' }));
    await user.click(screen.getByRole('button', { name: /^1?\s*Add$/u }));
    expect(onResponse).toHaveBeenCalledWith(pluginOffer, {
      action: 'submit',
      values: {},
      metadata: { save_as_default: [], apply: 'now' },
    });
  });

  it('offers a plugin the same way: its name, Plugin from its marketplace, the reason, Add', async () => {
    const user = userEvent.setup();
    const pluginOffer: PendingInteraction = {
      ...offer,
      id: 'connector:plg',
      title: 'Add tariff-calc to this conversation',
      payload: {
        connector_id: '',
        connector_name: 'tariff-calc',
        tool_name: 'offer_plugin',
        intent: 'add_plugin',
        plugin_id: 'tariff-calc',
        plugin_ref: 'trade-lab/tariff-calc',
        reason: 'It computes duty and VAT for the shipment you described.',
        missing: [],
      },
    };
    const onResponse = vi.fn(async () => undefined);
    renderWith(
      <ClioPendingInteractions
        interactions={[pluginOffer]}
        onResponse={onResponse}
        viewedSessionId="sess_root"
      />,
    );
    expect(await screen.findByText('Add Tariff calc to this conversation?')).toBeTruthy();
    expect(screen.getByText('Plugin from trade-lab')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Settings/u })).toBeNull();
    expect(repository.connectors).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^1?\s*Add$/u }));
    expect(onResponse).toHaveBeenCalledWith(pluginOffer, {
      action: 'submit',
      values: {},
      metadata: { save_as_default: [], apply: 'note' },
    });
    cleanup();
    renderWith(<ConversationInteractionActivity artifacts={{}} interaction={pluginOffer} />);
    const line = document.querySelector('[data-slot="connector-setup-activity"]');
    expect(line?.textContent).toContain('to this conversation');
    expect(screen.getByRole('button', { name: /Choose below/u })).toBeTruthy();
  });

  it('says what a plugin is, why, what it brings, and opens the plugin explorer with the card kept', async () => {
    const user = userEvent.setup();
    const description =
      'Landed cost of imported goods: customs duty by tariff line and origin, VAT on the duty-paid value.';
    const tariff = pluginEntrySchema.parse({
      id: 'tariff-calc',
      ref: 'trade-lab/tariff-calc',
      description,
      marketplace: 'trade-lab',
      skills: ['tariff-landed-cost'],
      mcp_servers: ['tariff'],
      fragments: ['customs-terms', 'vat-rules'],
      trusted: true,
    });
    repository.plugins.mockResolvedValue({ plugins: [tariff], default_marketplace_error: null });
    repository.inspectPlugin.mockResolvedValue({
      plugin: tariff,
      skill: '',
      files: [],
      incomplete: false,
      reason: '',
    });
    const pluginOffer: PendingInteraction = {
      ...offer,
      id: 'connector:plg2',
      payload: {
        connector_id: '',
        connector_name: 'tariff-calc',
        tool_name: 'offer_plugin',
        intent: 'add_plugin',
        plugin_id: 'tariff-calc',
        plugin_ref: 'trade-lab/tariff-calc',
        description: 'Landed cost of imported goods',
        reason: 'Needed to look up the duty rate for HS 6109.10 rather than rely on memory.',
        missing: [],
      },
    };
    const onResponse = vi.fn(async () => undefined);
    renderWith(
      <ClioPendingInteractions
        interactions={[pluginOffer]}
        onResponse={onResponse}
        viewedSessionId="sess_root"
      />,
    );
    // The plugin row's whole description, not the payload's short one, once it loads.
    expect(await screen.findByRole('button', { name: description })).toBeTruthy();
    expect(screen.getByRole('button', { name: /duty rate for HS 6109\.10/u })).toBeTruthy();
    const brings = document.querySelector('[data-slot="connector-offer-contents"]');
    expect(brings?.textContent).toBe(
      'Brings 1 skill, 1 MCP server and 2 prompt fragments to this conversation',
    );
    expect(brings?.textContent).not.toContain('\u00b7');
    // Add and Not now stay first; View plugin and the contents come after.
    const options = document.querySelector('[data-slot="ask-options"]')!;
    const order = [...options.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(order[0]).toMatch(/Add/u);
    expect(order[1]).toMatch(/Not now/u);
    await user.click(screen.getByRole('button', { name: 'View plugin' }));
    // The explorer is loaded on first use.
    expect(await screen.findByRole('dialog', undefined, { timeout: 8000 })).toBeTruthy();
    expect(repository.inspectPlugin).toHaveBeenCalledWith(
      'trade-lab/tariff-calc',
      false,
      expect.anything(),
    );
    // Escape closes the explorer; the offer is not answered and stays.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onResponse).not.toHaveBeenCalled();
    expect(screen.getByText('Add Tariff calc to this conversation?')).toBeTruthy();
  });

  it('counts a connector with its plugin: its skill and its server with the tool count', async () => {
    repository.connectors.mockResolvedValue([
      viewer({ enabled: true, tool_count: 13, plugin: 'viewer', plugin_ref: 'lab/viewer' }),
    ]);
    repository.plugins.mockResolvedValue({
      plugins: [
        pluginEntrySchema.parse({
          id: 'viewer',
          ref: 'lab/viewer',
          skills: ['viewer-scenes'],
          follows: 'fixture-viewer',
        }),
      ],
      default_marketplace_error: null,
    });
    renderDock();
    await waitFor(() =>
      expect(document.querySelector('[data-slot="connector-offer-contents"]')?.textContent).toBe(
        'Brings 1 skill and 1 MCP server (13 tools) to this conversation',
      ),
    );
    expect(screen.getByRole('button', { name: 'View plugin' })).toBeTruthy();
  });

  it('views a connector as a connector, in its own pane, never through its carrier (PL-D1)', async () => {
    const user = userEvent.setup();
    repository.connectors.mockResolvedValue([
      viewer({
        enabled: true,
        tool_count: 4,
        plugin_ref: 'clio-connectors/connector-fixture-viewer',
      }),
    ]);
    repository.plugins.mockResolvedValue({
      plugins: [
        pluginEntrySchema.parse({
          id: 'connector-fixture-viewer',
          ref: 'clio-connectors/connector-fixture-viewer',
          marketplace: 'clio-connectors',
          mcp_servers: ['fixture-viewer'],
          follows: 'fixture-viewer',
        }),
      ],
      default_marketplace_error: null,
    });
    renderDock();
    await user.click(await screen.findByRole('button', { name: 'View connector' }));
    expect(screen.queryByRole('button', { name: 'View plugin' })).toBeNull();
    const dialog = await screen.findByRole('dialog', { name: 'Connector details' });
    expect(within(dialog).getByText('Connector (an MCP server)')).toBeTruthy();
    expect(dialog.textContent).not.toContain('connector-fixture-viewer');
    // Closing it returns to the offer, which stays for Add.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: /^1?\s*Add$/u })).toBeTruthy();
  });
});
