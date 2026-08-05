/**
 * Settings contract (gact-tui#337).
 *
 * The rule is "backed pages only; unbacked ship hidden". A settings page with
 * no backing is worse than a missing one: it promises a control that cannot
 * work.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Client } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { Settings } from '../../src/settings/Settings';
import { SETTINGS_PAGES, backedPages } from '../../src/settings/pages';

/**
 * Every method a settings detail pane might call, stubbed with a safe
 * default. `Client` always has every one of these in production (they are
 * real class methods on the concrete class, verified against the inheritance
 * chain) — the exhaustive stub here exists only so a plain mock object never
 * throws "not a function" when a page not under test happens to fetch.
 */
function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    baseUrl: 'http://live.test',
    capabilities: vi.fn(async () => ({
      contract_version: '0.2',
      backend: { name: 'gact-agent', version: '0.9.2', vendor: 'iowarp' },
      capabilities: {},
      transports: {},
      auth: {},
      extensions: [],
    })),
    health: vi.fn(async () => ({ healthy: true, uptime_s: 1, integrations: [] })),
    metrics: vi.fn(async () => ({ uptime_s: 1 })),
    memoryStats: vi.fn(async () => ({ cache: { hits: 0, misses: 0, hit_rate: 0, capacity: 0 } })),
    policies: vi.fn(async () => ({ policies: {} })),
    hooks: vi.fn(async () => ({ hooks: [] })),
    commands: vi.fn(async () => ({ commands: [] })),
    prompts: vi.fn(async () => ({ prompts: [], sources: [] })),
    mcpServers: vi.fn(async () => ({ servers: [] })),
    agentBlueprints: vi.fn(async () => ({ blueprints: [] })),
    expertPacks: vi.fn(async () => ({ packs: [] })),
    providers: vi.fn(async () => ({ providers: [] })),
    lmConfig: vi.fn(async () => ({ configured: false, provider: '', api_base: '', model: '' })),
    relayStatus: vi.fn(async () => ({ configured: false })),
    // `fetchAgentBlueprint` (BlueprintsPage/BlueprintWindow) goes through the
    // generic transport, not a dedicated Client method.
    get: vi.fn(async () => ({ agent_blueprint: {}, agents: [], mcp_descriptors: [] })),
    ...overrides,
  } as unknown as Client;
}

describe('settings page inventory', () => {
  it('marks every page with how it is backed', () => {
    for (const page of SETTINGS_PAGES) {
      expect(['backend', 'client', 'unbacked']).toContain(page.backing);
    }
  });

  it('hides exactly the unbacked pages', () => {
    const hidden = SETTINGS_PAGES.filter((p) => p.backing === 'unbacked').map((p) => p.id);
    // clio-agent#1179 landed GET /v1/relay/status, so relays is no longer
    // unbacked (see the RelaysPage/relayStatus() findings). Plugins and
    // Data & backups were reclassified earlier — wire/plugins.ts and
    // wire/settings-export.ts are real, working client-only modules. Nothing
    // is currently hidden.
    expect(hidden.sort()).toEqual([]);
    const visible = backedPages().map((p) => p.id);
    for (const id of hidden) expect(visible).not.toContain(id);
  });

  it('names the client method backing each backend page', () => {
    // A page claiming backend backing must say which call proves it, so the
    // claim is checkable rather than asserted.
    for (const page of SETTINGS_PAGES.filter((p) => p.backing === 'backend')) {
      expect(page.method, `${page.id} claims backend backing with no method`).toBeTruthy();
    }
  });

  it('covers the prototype page set', () => {
    // Every page the prototype's settings nav carries is accounted for —
    // present-and-backed or present-and-hidden, never silently forgotten.
    const ids = SETTINGS_PAGES.map((p) => p.id).sort();
    expect(ids).toEqual(
      [
        'about', 'agents', 'appearance', 'backends', 'blueprints', 'commands',
        'data', 'doctor', 'expert-packs', 'hooks', 'mcp', 'memory', 'metrics',
        'models', 'plugins', 'policies', 'prompts', 'providers', 'relays',
        'session-defaults',
      ].sort(),
    );
  });

  it('groups every backed page under a CONNECTION/AGENTS/TELEMETRY/APP section', () => {
    for (const page of backedPages()) {
      expect(['Connection', 'Agents', 'Telemetry', 'App']).toContain(page.group);
    }
  });
});

describe('Settings', () => {
  it('renders only backed pages in the nav', async () => {
    const client = makeClient();
    render(<Settings client={client} />);
    const nav = screen.getByRole('navigation', { name: /settings/i });
    expect(within(nav).getByRole('button', { name: /providers/i })).toBeInTheDocument();
    // relays is backed (clio-agent#1179 — GET /v1/relay/status) and visible.
    expect(within(nav).getByRole('button', { name: /^relays$/i })).toBeInTheDocument();
    await waitFor(() => expect(client.capabilities).toHaveBeenCalled());
  });

  it('renders real Relays content from relayStatus(), not a placeholder', async () => {
    const client = makeClient({
      relayStatus: vi.fn(async () => ({
        configured: true,
        host: '127.0.0.1',
        reachable: true,
        detail: 'TCP connect to 127.0.0.1:18783 succeeded',
      })),
    });
    render(<Settings client={client} />);
    fireEvent.click(screen.getByRole('button', { name: /^relays$/i }));
    await waitFor(() => expect(client.relayStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('settings-unbuilt')).toBeNull();
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument();
    expect(screen.getByText(/reachable/i)).toBeInTheDocument();
  });

  it('shows an honest empty state for Relays when no relay is configured', async () => {
    const client = makeClient({ relayStatus: vi.fn(async () => ({ configured: false })) });
    render(<Settings client={client} />);
    fireEvent.click(screen.getByRole('button', { name: /^relays$/i }));
    await waitFor(() => expect(screen.getByText(/No relay configured/i)).toBeInTheDocument());
  });

  it('renders the section headers in prototype order', async () => {
    const client = makeClient();
    render(<Settings client={client} />);
    const nav = screen.getByRole('navigation', { name: /settings/i });
    const text = nav.textContent ?? '';
    const iConnection = text.indexOf('CONNECTION');
    const iAgents = text.indexOf('AGENTS');
    const iTelemetry = text.indexOf('TELEMETRY');
    const iApp = text.indexOf('APP');
    expect(iConnection).toBeGreaterThanOrEqual(0);
    expect(iAgents).toBeGreaterThan(iConnection);
    expect(iTelemetry).toBeGreaterThan(iAgents);
    expect(iApp).toBeGreaterThan(iTelemetry);
    await waitFor(() => expect(client.capabilities).toHaveBeenCalled());
  });

  it('switches pages', async () => {
    const client = makeClient();
    render(<Settings client={client} />);
    fireEvent.click(screen.getByRole('button', { name: /doctor/i }));
    expect(screen.getByTestId('settings-page')).toHaveTextContent(/doctor/i);
    await waitFor(() => expect(client.health).toHaveBeenCalled());
  });

  it('defaults to Backends, matching the prototype default page', async () => {
    const client = makeClient();
    render(<Settings client={client} />);
    expect(screen.getByTestId('settings-page')).toHaveTextContent(/backends/i);
    await waitFor(() => expect(client.capabilities).toHaveBeenCalled());
  });

  it('renders real Doctor content from health()/capabilities(), not a placeholder', async () => {
    const client = makeClient({
      health: vi.fn(async () => ({ healthy: true, uptime_s: 120, integrations: [] })),
    });
    render(<Settings client={client} />);
    fireEvent.click(screen.getByRole('button', { name: /doctor/i }));
    await waitFor(() => expect(client.health).toHaveBeenCalled());
    expect(screen.queryByTestId('settings-unbuilt')).toBeNull();
    expect(screen.getByText(/Backend reachable/i)).toBeInTheDocument();
  });

  it('renders an honest empty state on Metrics with no active session', async () => {
    // No pill props threaded (no active session) — there is no per-session
    // metrics route to fall back to, so the page says so rather than
    // fetching/rendering global counters that aren't what the prototype's
    // row set asks for.
    const client = makeClient();
    render(<Settings client={client} />);
    fireEvent.click(screen.getByRole('button', { name: /metrics/i }));
    expect(screen.queryByTestId('settings-unbuilt')).toBeNull();
    expect(client.metrics).not.toHaveBeenCalled();
    expect(screen.getByText(/No active session to report metrics for/i)).toBeInTheDocument();
  });

  it('renders real per-session Metrics rows from the composer-pill props, not a placeholder', async () => {
    const client = makeClient();
    render(
      <Settings
        client={client}
        contextPercent={41}
        contextTokens={82100}
        contextLimit={200000}
        toolCallCount={14}
        artifactCount={5}
        asyncTasks={
          [
            { task_id: 't1', status: 'completed' },
            { task_id: 't2', status: 'completed' },
            { task_id: 't3', status: 'running' },
          ] as never
        }
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /metrics/i }));
    expect(screen.queryByTestId('settings-unbuilt')).toBeNull();
    // context: real percent + real token/limit breakdown.
    expect(screen.getByText('41%')).toBeInTheDocument();
    expect(screen.getByText('82.1k / 200k')).toBeInTheDocument();
    // tool calls: real transcript-derived count, honestly session-scoped
    // (not the prototype's literal, misleading "all sessions" label).
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('this session')).toBeInTheDocument();
    // child tasks: real count + a real status breakdown, not the
    // prototype's hardcoded "4 completed · 2 running" mock string.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2 completed · 1 running')).toBeInTheDocument();
    // artifacts: real composer-pill count.
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows the prototype empty state for a genuinely empty Prompts catalog', async () => {
    const client = makeClient({ prompts: vi.fn(async () => ({ prompts: [], sources: [] })) });
    render(<Settings client={client} />);
    fireEvent.click(screen.getByRole('button', { name: /^prompts$/i }));
    await waitFor(() => expect(screen.getByText(/No saved prompts/i)).toBeInTheDocument());
  });

  it("derives a real 'N declared children' count for the ACTIVE session's blueprint row, leaving the others' real descriptions alone", async () => {
    const client = makeClient({
      agentBlueprints: vi.fn(async () => ({
        blueprints: [
          { id: 'earthscope-gnss-region', name: 'earthscope-gnss-region', version: '0.1.0' },
          {
            id: 'ndp-wildfire-smoke',
            name: 'ndp-wildfire-smoke',
            version: '0.2.1',
            description: 'depth-2 nested chain',
          },
        ],
      })),
      get: vi.fn(async (path: string) => {
        if (path.includes('earthscope-gnss-region')) {
          return {
            agent_blueprint: { id: 'earthscope-gnss-region' },
            // tier 1 = root orchestrator, tier 2/3 = declared children.
            agents: [{ id: 'root', tier: 1 }, { id: 'a', tier: 2 }, { id: 'b', tier: 2 }, { id: 'c', tier: 3 }],
            mcp_descriptors: [],
          };
        }
        throw new Error(`unexpected blueprint detail fetch: ${path}`);
      }),
    });
    render(<Settings client={client} activeBlueprintId="earthscope-gnss-region" />);
    fireEvent.click(screen.getByRole('button', { name: /^Agent blueprints$/i }));
    await waitFor(() => expect(client.get).toHaveBeenCalledWith(expect.stringContaining('earthscope-gnss-region')));
    expect(
      await screen.findByText('this session · 3 declared children'),
    ).toBeInTheDocument();
    // The other row keeps its own real description — no fetch, no fabricated count.
    expect(screen.getByText('depth-2 nested chain')).toBeInTheDocument();
  });

  it("reflects the active session's real approval mode on Policies, not the (nonexistent) policies-document field", async () => {
    const client = makeClient({ policies: vi.fn(async () => ({ policies: [] })) });
    const onApprovalModeChange = vi.fn();
    render(
      <Settings client={client} approvalMode="bypass" onApprovalModeChange={onApprovalModeChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^policies$/i }));
    await waitFor(() => expect(client.policies).toHaveBeenCalled());
    const askButton = await screen.findByRole('button', { name: /^Ask/i });
    const executeButton = screen.getByRole('button', { name: /^Execute/i });
    // Real state: the session is in 'bypass', not 'ask' — Execute (the
    // honest "not asking" reflection) is checked, Ask is not.
    expect(askButton).toHaveTextContent('Ask');
    expect(askButton.textContent).not.toContain('✓');
    expect(executeButton.textContent).toContain('✓');
    expect(executeButton).toBeDisabled();
    // Ask is the one unambiguous safe write — clicking it PATCHes for real.
    expect(askButton).not.toBeDisabled();
    fireEvent.click(askButton);
    expect(onApprovalModeChange).toHaveBeenCalledWith('ask');
  });

  it('shows an honest disabled Policies approval-mode row with no active session', async () => {
    const client = makeClient({ policies: vi.fn(async () => ({ policies: [] })) });
    render(<Settings client={client} />);
    fireEvent.click(screen.getByRole('button', { name: /^policies$/i }));
    const askButton = await screen.findByRole('button', { name: /^Ask/i });
    const executeButton = screen.getByRole('button', { name: /^Execute/i });
    expect(askButton).toBeDisabled();
    expect(executeButton).toBeDisabled();
    expect(askButton.textContent).not.toContain('✓');
    expect(executeButton.textContent).not.toContain('✓');
  });
});
