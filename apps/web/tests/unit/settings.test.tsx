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

  it('renders the Metrics page from metrics(), not a placeholder', async () => {
    const client = makeClient({
      metrics: vi.fn(async () => ({ uptime_s: 10, sessions: { total: 3, active: 1 } })),
    });
    render(<Settings client={client} />);
    fireEvent.click(screen.getByRole('button', { name: /metrics/i }));
    await waitFor(() => expect(client.metrics).toHaveBeenCalled());
    expect(screen.queryByTestId('settings-unbuilt')).toBeNull();
  });

  it('shows the prototype empty state for a genuinely empty Prompts catalog', async () => {
    const client = makeClient({ prompts: vi.fn(async () => ({ prompts: [], sources: [] })) });
    render(<Settings client={client} />);
    fireEvent.click(screen.getByRole('button', { name: /^prompts$/i }));
    await waitFor(() => expect(screen.getByText(/No saved prompts/i)).toBeInTheDocument());
  });
});
