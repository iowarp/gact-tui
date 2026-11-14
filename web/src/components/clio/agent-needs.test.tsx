import { connectorSchema, type PendingInteraction } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  connectors: vi.fn(async () => []),
  sessionConnector: vi.fn(),
  connectorLogo: vi.fn(),
  capabilities: vi.fn(async () => ({ capabilities: { x_clio_agent_plugins: true } })),
  agents: vi.fn(async () => []),
  plugins: vi.fn(async () => ({ plugins: [], default_marketplace_error: null })),
  mcpServers: vi.fn(async () => []),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

import { TooltipProvider } from '@/components/ui/tooltip';
import { groupCatalogEntries, listedInYours } from '@/lib/connector-groups';
import { connectorSetupWords } from '@/lib/connector-plugin';
import { ConversationInteractionActivity } from './conversation-interaction-activity';
import { ClioPendingInteractions } from './pending-interactions';

const item = (value: Record<string, unknown>) => ({
  connector_id: String(value.id),
  kind: 'connector',
  logo_url: null,
  reasons: ['off'],
  enabled: false,
  download: false,
  download_unknown: false,
  asks_sign_in: false,
  missing: [],
  settings: [],
  ...value,
});

function card(payload: Record<string, unknown>, actions = ['submit', 'decline']) {
  return {
    id: 'connector:needs1',
    kind: 'connector_setup',
    owner_session_id: 'sess_root',
    attended_session_id: 'sess_root',
    status: 'pending',
    title: 'EarthScope uses Geo, National Data Platform',
    prompt: 'Enable Geo, National Data Platform for EarthScope?',
    requires_human_response: true,
    source: { protocol: 'native' },
    created_at: '2026-11-14T00:00:00Z',
    payload: {
      interaction_id: 'connector:needs1',
      intent: 'agent_needs',
      connector_id: '',
      connector_name: 'Geo, National Data Platform',
      missing: [],
      agent_ref: 'clio/earthscope',
      agent_name: 'EarthScope',
      phase: 'ask',
      items: [
        item({ id: 'geo', name: 'Geo', reasons: ['off', 'download'], download: true }),
        item({
          id: 'ndp',
          name: 'National Data Platform',
          kind: 'plugin',
          reasons: ['off', 'download'],
          download: true,
          settings: [{ key: 'region', kind: 'value', label: 'Region', required: false }],
        }),
      ],
      ...payload,
    },
    actions,
  } as PendingInteraction;
}

function renderDock(interaction: PendingInteraction, onResponse = vi.fn(async () => undefined)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ClioPendingInteractions
          interactions={[interaction]}
          onResponse={onResponse}
          viewedSessionId="sess_root"
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return onResponse;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the agent-load card', () => {
  it('asks once, naming each item with its kind and what enabling does', () => {
    renderDock(card({}));
    expect(
      screen.getByText(
        'EarthScope uses Geo and National Data Platform, which are not enabled. Enable them?',
      ),
    ).toBeTruthy();
    const rows = document.querySelectorAll('[data-slot="agent-needs-item"]');
    expect([...rows].map((row) => row.textContent)).toEqual([
      'GGeoConnectordownloads its tools', // the monogram logo, then the words
      'NPNational Data PlatformPlugindownloads its tools',
    ]);
    expect(
      screen.getByText('Not now: EarthScope works without them and can offer them later.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Enable all/u })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Not now/u })).toBeTruthy();
    // Settings (n) is folded: no toggles until it is opened.
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('Enable all sends every item; Not now declines', async () => {
    const user = userEvent.setup();
    const onResponse = renderDock(card({}));
    await user.click(screen.getByRole('button', { name: /Enable all/u }));
    expect(onResponse).toHaveBeenCalledWith(expect.objectContaining({ id: 'connector:needs1' }), {
      action: 'submit',
      values: {},
      metadata: { items: ['geo', 'ndp'] },
    });
    await user.click(screen.getByRole('button', { name: /Not now/u }));
    expect(onResponse).toHaveBeenLastCalledWith(expect.anything(), { action: 'decline' });
  });

  it('Settings leaves an item out and sets its optional values', async () => {
    const user = userEvent.setup();
    const onResponse = renderDock(card({}));
    await user.click(screen.getByRole('button', { name: /Settings \(2\)/u }));
    const geo = screen.getByRole('checkbox', { name: /Enable Geo/u });
    await user.click(geo);
    expect(screen.getByRole('button', { name: /Enable 1/u })).toBeTruthy();
    await user.type(screen.getByLabelText(/Region/u), 'west');
    await user.click(screen.getByRole('button', { name: /Enable 1/u }));
    expect(onResponse).toHaveBeenCalledWith(expect.anything(), {
      action: 'submit',
      values: { ndp: { region: 'west' } },
      metadata: { items: ['ndp'] },
    });
  });

  it('a required value that is missing shows in the card', () => {
    renderDock(
      card({
        items: [
          item({
            id: 'ha',
            name: 'Home Assistant',
            kind: 'plugin',
            reasons: ['off', 'needs'],
            missing: [{ key: 'address', kind: 'address', label: 'Your address', required: true }],
          }),
        ],
      }),
    );
    expect(
      screen.getByText('EarthScope uses Home Assistant, which is not enabled. Enable it?'),
    ).toBeTruthy();
    expect(document.querySelector('[data-slot="agent-needs-item"]')?.textContent).toContain(
      'turns it on, needs your address',
    );
    expect(screen.getByLabelText(/Your address/u)).toBeTruthy();
    expect(
      screen.getByText('Not now: EarthScope works without it and can offer it later.'),
    ).toBeTruthy();
  });

  it('says each item’s progress in words while it works and when it is done', async () => {
    const user = userEvent.setup();
    const working = card(
      {
        phase: 'working',
        items: [
          item({ id: 'geo', name: 'Geo', progress: 'preparing' }),
          item({ id: 'ndp', name: 'National Data Platform', progress: 'waiting' }),
        ],
      },
      ['dismiss'],
    );
    const onResponse = renderDock(working);
    expect(screen.getByText('Enabling Geo and National Data Platform…')).toBeTruthy();
    expect(screen.getByText('Downloading its tools…')).toBeTruthy();
    expect(screen.getByText('Waiting')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Hide/u }));
    expect(onResponse).toHaveBeenCalledWith(expect.anything(), { action: 'dismiss' });
    cleanup();
    const done = card(
      {
        phase: 'done',
        items: [
          item({ id: 'geo', name: 'Geo', progress: 'ready', tool_count: 12 }),
          item({
            id: 'ndp',
            name: 'National Data Platform',
            progress: 'failed',
            detail: 'Could not download its packages.',
          }),
        ],
      },
      ['dismiss', 'submit'],
    );
    const again = renderDock(done);
    expect(screen.getByText('1 could not be enabled')).toBeTruthy();
    expect(screen.getByText('Ready, 12 tools')).toBeTruthy();
    expect(screen.getByText('Not enabled: Could not download its packages.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Try again/u }));
    expect(again).toHaveBeenCalledWith(expect.anything(), {
      action: 'submit',
      metadata: { items: ['ndp'] },
    });
  });

  it('the conversation line names what it enables and how it ended', () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ConversationInteractionActivity
          artifacts={{}}
          interaction={{ ...card({}), status: 'denied', actions: [] }}
        />
      </QueryClientProvider>,
    );
    const line = document.querySelector('[data-slot="connector-setup-activity"]');
    expect(
      within(line as HTMLElement).getByText('Enable Geo, National Data Platform'),
    ).toBeTruthy();
    expect(within(line as HTMLElement).getByText('not now')).toBeTruthy();
  });
});

describe('Discover with every clio-kit server', () => {
  const connector = (id: string, group: string | null, extra: Record<string, unknown> = {}) =>
    connectorSchema.parse({
      id,
      name: id,
      state: { status: 'ready' },
      group,
      ...extra,
    });

  it('groups catalog entries by domain, ungrouped last', () => {
    const groups = groupCatalogEntries(
      [
        connector('hdf5', 'Data formats'),
        connector('burette', null),
        connector('slurm', 'HPC'),
        connector('parquet', 'Data formats'),
      ].map((row) => ({ connector: row })),
    );
    expect(groups.map((group) => [group.label, group.entries.map((e) => e.connector.id)])).toEqual([
      ['Data formats', ['hdf5', 'parquet']],
      ['HPC', ['slurm']],
      ['Other', ['burette']],
    ]);
  });

  it('a clio-kit connector is yours once enabled and says it downloads when enabled', () => {
    const off = connector('hdf5', 'Data formats', { kit: 'hdf5' });
    expect(listedInYours(off)).toBe(false);
    expect(listedInYours({ ...off, enabled: true })).toBe(true);
    expect(listedInYours(connector('burette', null))).toBe(true);
    expect(connectorSetupWords(off)).toBe('Downloads its tools when you enable it');
    expect(connectorSetupWords(connector('burette', null))).toBe('');
  });
});
