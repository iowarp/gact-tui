import {
  connectorSchema,
  pluginEntrySchema,
  type Connector,
  type PendingInteraction,
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
  setConnectorValues: vi.fn(),
  enableConnector: vi.fn(),
  disableConnector: vi.fn(),
  capabilities: vi.fn(async () => ({ capabilities: {} })),
  agents: vi.fn(async () => []),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

import { TooltipProvider } from '@/components/ui/tooltip';
import {
  connectorStatus,
  offeredPlugins,
  pluginConnectorStatus,
} from '@/lib/connector-presentation';
import { extensionEntries } from '@/lib/extension-library-entries';
import { monogramInitials } from '@/lib/monogram';
import { draftValues, unfilledRequired } from '@/lib/connector-draft';
import { ConnectorPane } from './connector-pane';
import { ClioPendingInteractions } from './pending-interactions';
import { questionInteractionsForTool, splitWaitingQuestion } from './agent-answer-domain';
import { ConversationInteractionActivity } from './conversation-interaction-activity';

const connector = (value: Partial<Record<string, unknown>> = {}): Connector =>
  connectorSchema.parse({
    id: 'fixture-address',
    name: 'Fixture address',
    description: 'Needs an address and a sign-in',
    logo_url: null,
    source: 'catalog',
    enabled: true,
    tool_count: null,
    state: { status: 'needs', needs: ['address', 'account'], reason: null },
    needs: [
      {
        key: 'address',
        kind: 'address',
        label: 'Server address',
        required: true,
        agent_settable: true,
      },
      { key: 'account', kind: 'sign-in', label: 'Account', required: true },
      { key: 'token', kind: 'secret', label: 'Access token', required: false, has_value: true },
    ],
    ...value,
  });

function renderWith(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  repository.connectors.mockResolvedValue([connector()]);
  repository.sessionConnector.mockImplementation(async () => connector());
  repository.connectorLogo.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"/>');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('connector state in words', () => {
  it('names what is needed, why it cannot be reached, and the tool count when ready', () => {
    expect(connectorStatus(connector()).label).toBe('Needs server address and a sign-in');
    expect(
      connectorStatus(
        connector({
          state: {
            status: 'unreachable',
            needs: [],
            reason: 'Nothing answered at http://127.0.0.1:19199/mcp: the connection was refused.',
          },
        }),
      ),
    ).toMatchObject({
      tone: 'error',
      label: 'Can’t be reached',
      detail: 'Nothing answered at http://127.0.0.1:19199/mcp: the connection was refused.',
    });
    expect(
      connectorStatus(connector({ state: { status: 'ready', needs: [] }, tool_count: 1 })).label,
    ).toBe('Ready, 1 tool');
    expect(connectorStatus(connector({ enabled: false })).label).toBe('Not enabled');
  });

  it('makes a monogram from the first and last words, or a single word’s parts', () => {
    expect(monogramInitials('Fixture Sign-in')).toBe('FS');
    expect(monogramInitials('Jaime Cernuda')).toBe('JC');
    expect(monogramInitials('fixture-address')).toBe('FA');
    expect(monogramInitials('')).toBe('');
  });

  it('lists connectors first; pickers offer a connector plugin only while it is on', () => {
    const plugins = [
      pluginEntrySchema.parse({ id: 'tools', ref: 'lab/tools', marketplace: 'lab', trusted: true }),
      pluginEntrySchema.parse({
        id: 'scenes',
        ref: 'clio/scenes',
        marketplace: 'clio',
        trusted: true,
        follows: 'fixture-address',
        connector: { id: 'fixture-address', name: 'Fixture address', enabled: false },
      }),
      pluginEntrySchema.parse({
        id: 'connector-fixture-on',
        ref: 'clio-connectors/connector-fixture-on',
        marketplace: 'clio-connectors',
        trusted: true,
        follows: 'fixture-on',
        connector: { id: 'fixture-on', name: 'Fixture on', enabled: true, status: 'ready' },
      }),
    ];
    const rows = extensionEntries({
      type: 'all',
      plugins,
      marketplaces: [],
      saved: [{ name: 'fixture-address', transport: 'http', always_load: false, spec: {} }],
      servers: [],
      connectors: [connector()],
    });
    expect(rows.map((row) => [row.kind, row.title])).toEqual([
      ['connector', 'Fixture address'],
      ['plugin', 'tools'],
    ]);
    expect(rows[0]!.status?.label).toBe('Needs server address and a sign-in');
    expect(offeredPlugins(plugins)?.map((plugin) => plugin.id)).toEqual([
      'tools',
      'connector-fixture-on',
    ]);
    expect(pluginConnectorStatus(plugins[2]!.connector!)).toBe('Ready');
  });

  it('sends only what changed, never an empty secret, and clears an emptied value', () => {
    const needs = connector({
      needs: [
        { key: 'address', kind: 'address', label: 'A', value: 'old', has_value: true },
        { key: 'token', kind: 'secret', label: 'T', has_value: true },
        { key: 'via', kind: 'value', label: 'V', value: 'hop', has_value: true },
      ],
    }).needs;
    expect(draftValues(needs, { address: 'old', token: '', via: '' })).toEqual({ via: null });
    expect(draftValues(needs, { address: 'new', token: 's3cret' })).toEqual({
      address: 'new',
      token: 's3cret',
    });
    expect(unfilledRequired(connector().needs, {}).map((need) => need.key)).toEqual([
      'address',
      'account',
    ]);
  });
});

describe('the setup card in Extensions', () => {
  it('shows the state, one row per need, masks the saved secret and saves the values', async () => {
    const user = userEvent.setup();
    repository.setConnectorValues.mockResolvedValue(connector());
    renderWith(
      <ConnectorPane
        connector={connector()}
        onClose={() => undefined}
        onSignIn={() => undefined}
      />,
    );
    const card = screen.getByRole('complementary', { name: 'Fixture address' });
    expect(within(card).getByText('Needs server address and a sign-in')).toBeTruthy();
    const secret = within(card).getByLabelText('Access token') as HTMLInputElement;
    expect(secret.type).toBe('password');
    expect(secret.value).toBe('');
    expect(secret.placeholder).toContain('Saved');
    expect(within(card).getByRole('button', { name: 'Sign in' })).toBeTruthy();
    await user.type(within(card).getByLabelText('Server address'), 'http://127.0.0.1:19201/mcp');
    await user.type(secret, 'new-token');
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(repository.setConnectorValues).toHaveBeenCalledWith('fixture-address', {
        address: 'http://127.0.0.1:19201/mcp',
        token: 'new-token',
      }),
    );
    // The secret is never shown again once saved.
    await waitFor(() => expect(secret.value).toBe(''));
  });

  it('shows a value the agent set', async () => {
    const set = connector({
      needs: [
        {
          key: 'address',
          kind: 'address',
          label: 'Server address',
          value: 'node08',
          has_value: true,
          agent_settable: true,
        },
      ],
      state: { status: 'ready', needs: [] },
    });
    renderWith(
      <ConnectorPane connector={set} onClose={() => undefined} onSignIn={() => undefined} />,
    );
    expect((screen.getByLabelText('Server address') as HTMLInputElement).value).toBe('node08');
    expect(screen.getByText(/The agent can set this/u)).toBeTruthy();
  });

  it('ends help without a full stop with one before "The agent can set this."', () => {
    const helped = connector({
      needs: [
        {
          key: 'address',
          kind: 'address',
          label: 'Server address',
          help: 'For example http://127.0.0.1:19101/mcp',
          agent_settable: true,
        },
      ],
    });
    renderWith(
      <ConnectorPane connector={helped} onClose={() => undefined} onSignIn={() => undefined} />,
    );
    expect(
      screen.getByText('For example http://127.0.0.1:19101/mcp. The agent can set this.'),
    ).toBeTruthy();
  });

  it('says "Starting…" in words while Enable runs, then the settled state (CN3)', async () => {
    const user = userEvent.setup();
    const off = connector({ enabled: false });
    let finish: (value: Connector) => void = () => undefined;
    repository.enableConnector.mockImplementation(
      () => new Promise<Connector>((resolve) => (finish = resolve)),
    );
    renderWith(
      <ConnectorPane connector={off} onClose={() => undefined} onSignIn={() => undefined} />,
    );
    const card = screen.getByRole('complementary', { name: 'Fixture address' });
    expect(within(card).getAllByText('Not enabled').length).toBeGreaterThan(0);
    await user.click(within(card).getByRole('button', { name: 'Enable' }));
    // The state and the button both say it is starting; nothing reads "Not enabled".
    await waitFor(() =>
      expect(within(card).getByRole('button', { name: 'Starting…' })).toBeTruthy(),
    );
    expect(within(card).getAllByText('Starting…').length).toBeGreaterThanOrEqual(2);
    expect(within(card).queryByText('Not enabled')).toBeNull();
    expect(
      (within(card).getByRole('button', { name: 'Starting…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    finish(connector());
    await waitFor(() => expect(within(card).queryByText('Starting…')).toBeNull());
  });
});

describe('a connector row while it starts', () => {
  it('reads "Starting…" in the Extensions list', () => {
    const [row] = extensionEntries({
      type: 'mcp',
      plugins: [],
      marketplaces: [],
      saved: [],
      servers: [],
      connectors: [connector({ enabled: false })],
      changes: new Map([['fixture-address', 'starting' as const]]),
    });
    expect(row?.status).toEqual({ tone: 'running', label: 'Starting…' });
  });
});

describe('the setup card in the conversation', () => {
  const interaction: PendingInteraction = {
    id: 'int-1',
    kind: 'connector_setup',
    owner_session_id: 'sess_root',
    attended_session_id: 'sess_root',
    status: 'pending',
    title: 'Set up Fixture address',
    source: { protocol: 'native', tool_name: 'fixture-address__echo' },
    created_at: '2026-11-13T00:00:00Z',
    payload: {
      connector_id: 'fixture-address',
      tool_name: 'fixture-address__echo',
      missing: [{ key: 'address', kind: 'address', label: 'Server address', required: true }],
    },
    actions: ['submit', 'decline'],
  };

  function renderDock(onResponse = vi.fn(async () => undefined)) {
    renderWith(
      <ClioPendingInteractions
        interactions={[interaction]}
        onResponse={onResponse}
        viewedSessionId="sess_root"
      />,
    );
    return onResponse;
  }

  it('continues the waiting call with the rows filled', async () => {
    const user = userEvent.setup();
    const onResponse = renderDock();
    expect(await screen.findByText('Set up Fixture address')).toBeTruthy();
    const proceed = screen.getByRole('button', { name: /Continue/u });
    expect(proceed.hasAttribute('disabled')).toBe(true);
    await user.type(screen.getByLabelText('Server address'), 'http://127.0.0.1:19201/mcp');
    await user.click(screen.getByRole('button', { name: /Continue/u }));
    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'submit',
      values: { address: 'http://127.0.0.1:19201/mcp' },
      metadata: { save_as_default: [] },
    });
    expect(repository.sessionConnector).toHaveBeenCalledWith(
      'fixture-address',
      'sess_root',
      expect.anything(),
    );
  });

  it('keeps a value to this conversation unless "Save as default" is ticked (CV-D5)', async () => {
    const user = userEvent.setup();
    repository.sessionConnector.mockImplementation(async () =>
      connector({
        needs: [
          {
            key: 'address',
            kind: 'address',
            label: 'Server address',
            required: true,
            value: 'http://node08:1/mcp',
            default_value: 'http://here:1/mcp',
            conversation: true,
          },
        ],
      }),
    );
    const onResponse = renderDock();
    expect(
      await screen.findByText('This conversation only. Default: http://here:1/mcp'),
    ).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: 'Save as default' }));
    expect(screen.getByText('New conversations use it too.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Continue/u }));
    // Unchanged but ticked: its current value goes with it, so the default takes it.
    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'submit',
      values: { address: 'http://node08:1/mcp' },
      metadata: { save_as_default: ['address'] },
    });
  });

  it('declines', async () => {
    const user = userEvent.setup();
    const onResponse = renderDock();
    await user.click(await screen.findByRole('button', { name: /Decline/u }));
    expect(onResponse).toHaveBeenCalledWith(interaction, { action: 'decline' });
  });

  it('puts its line under the call it holds: "Set up …", waiting for you, then the outcome', () => {
    const linked: PendingInteraction = {
      ...interaction,
      source: { ...interaction.source, invocation_id: 'call_1' },
    };
    const { waiting, rest } = splitWaitingQuestion(
      questionInteractionsForTool([linked], 'call_1'),
      'fixture-address__echo',
    );
    // Not folded into the call's row: the card keeps its own line (CN5).
    expect(waiting).toBeUndefined();
    expect(rest).toEqual([linked]);
    expect(questionInteractionsForTool([linked], 'call_2')).toEqual([]);
    const { rerender } = renderWith(
      <ConversationInteractionActivity artifacts={{}} interaction={rest[0]!} />,
    );
    const line = document.querySelector('[data-slot="connector-setup-activity"]');
    expect(line?.textContent).toContain('Set up fixture-address');
    expect(screen.getByRole('button', { name: /Set up below/u }).textContent).toBe(
      'waiting for you',
    );
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <ConversationInteractionActivity
            artifacts={{}}
            interaction={{ ...linked, status: 'denied' }}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    expect(document.querySelector('[data-slot="connector-setup-activity"]')?.textContent).toContain(
      'declined',
    );
  });
});
