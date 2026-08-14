/**
 * gact-tui#369: the observability panel used to commit ONE `setObs` after
 * ALL 7 parallel reads settled — "Loading observability…" then every tab
 * appearing at once, so a single slow/hung read (e.g. the trace fan-out)
 * blocked tabs whose OWN reads (context, in this file's fixtures) had
 * already answered. `loadObservability` now commits each section the
 * instant IT settles (SessionView.applyObsPatch); a tab whose backing
 * section is still pending renders its own skeleton instead of the whole
 * panel staying on one generic notice.
 *
 * This file replaces the earlier "whole panel blocks on client.agents()"
 * pin (Opus adversarial review, fix #11) — that scenario tested exactly
 * the bug this issue fixes (an `agents()` hang, under the OLD monolithic
 * commit, blocked every tab even though `agents` backs no live P5 tab at
 * all) and is no longer the right contract to hold.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { SessionView } from '../../src/session/SessionView';

const SESSIONS = [
  { id: 'sess_a', title: 'LA ground motion', status: 'running', workspace_id: 'ws_default' },
] as unknown as Session[];
const MESSAGES: Message[] = [
  { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'ready' }] },
] as unknown as Message[];

async function selectSession(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
  await screen.findByText('ready');
}

async function openObservability(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Observability' }));
  return screen.findByRole('dialog', { name: /observability/i });
}

describe('SessionView observability panel: per-section progressive commit (gact-tui#369)', () => {
  it('paints the context tab the instant its OWN read settles while the trace-fed tabs still show their skeleton', async () => {
    let resolveTrace!: (value: { events: [] }) => void;
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      agents: vi.fn(async () => ({ agents: [] })),
      sessionTasks: vi.fn(async () => ({ tasks: [] })),
      mcpServers: vi.fn(async () => ({ servers: [] })),
      get: vi.fn(async (path: string) => {
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/artifacts')) return { artifacts: [] };
        // context resolves immediately with a real value...
        if (path.includes('/context')) return { used_pct: 0.41, used_tokens: 82_000, window_tokens: 200_000 };
        // ...the trace read (the fan-out's own aggregate) never does, for
        // the life of this test's first assertions.
        if (path.includes('/trace')) return new Promise((resolve) => (resolveTrace = resolve));
        throw new Error(`unstubbed GET ${path}`);
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();
    const obsLayer = await openObservability();

    // Default tab (timeline) is trace-fed — still pending.
    expect(await within(obsLayer).findByTestId('obs-pending')).toBeInTheDocument();

    // Context — independent read, already settled — paints for real.
    fireEvent.click(within(obsLayer).getByRole('tab', { name: /context/i }));
    const contextPanel = await within(obsLayer).findByTestId('obs-context');
    expect(contextPanel).toHaveTextContent('41%');
    expect(within(obsLayer).queryByTestId('obs-pending')).toBeNull();

    // Every OTHER trace-fed tab still shows the skeleton, not a premature
    // "no trace recorded" — an unresolved read is not the same fact as a
    // genuinely empty one.
    for (const name of [/^runs/i, /^tools/i, /artifacts/i]) {
      fireEvent.click(within(obsLayer).getByRole('tab', { name }));
      expect(within(obsLayer).getByTestId('obs-pending')).toBeInTheDocument();
      expect(within(obsLayer).queryByTestId('obs-empty')).toBeNull();
    }

    // The trace read resolves — the tab currently open (artifacts) paints
    // its real (here: genuinely empty) content, no skeleton left behind.
    resolveTrace({ events: [] });
    await waitFor(() => expect(within(obsLayer).queryByTestId('obs-pending')).toBeNull());
    expect(within(obsLayer).getByTestId('obs-empty')).toBeInTheDocument();
  });

  it('a rejecting trace read shows its own typed "unavailable" region without holding the context tab hostage', async () => {
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      agents: vi.fn(async () => ({ agents: [] })),
      sessionTasks: vi.fn(async () => ({ tasks: [] })),
      mcpServers: vi.fn(async () => ({ servers: [] })),
      get: vi.fn(async (path: string) => {
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/artifacts')) return { artifacts: [] };
        if (path.includes('/context')) return { used_pct: 0.1, used_tokens: 20_000, window_tokens: 200_000 };
        if (path.includes('/trace')) throw new Error('HTTP 500: trace store unreachable');
        throw new Error(`unstubbed GET ${path}`);
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();
    const obsLayer = await openObservability();

    const runsTab = await within(obsLayer).findByRole('tab', { name: /^runs/i });
    fireEvent.click(runsTab);
    expect(await within(obsLayer).findByTestId('obs-unavailable')).toHaveTextContent(/runs unavailable/i);

    // Context never touched the failing trace read — it still renders its
    // own, unrelated, real content.
    fireEvent.click(within(obsLayer).getByRole('tab', { name: /context/i }));
    expect(await within(obsLayer).findByTestId('obs-context')).toHaveTextContent('10%');
  });

  it('the panel-open, retry, and SSE-refresh paths all reuse the same per-section commit (no whole-panel "Loading observability…" notice anywhere)', async () => {
    // Every read hangs forever: proves the panel renders its REAL tab
    // strip + per-tab skeletons immediately rather than falling back to a
    // single "Loading observability…" placeholder for the whole layer
    // (the pre-gact-tui#369 behavior this issue removes).
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      agents: vi.fn(() => new Promise<never>(() => {})),
      sessionTasks: vi.fn(() => new Promise<never>(() => {})),
      mcpServers: vi.fn(() => new Promise<never>(() => {})),
      get: vi.fn(() => new Promise<never>(() => {})),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();
    const obsLayer = await openObservability();

    // The real tab strip (timeline/runs/tools/artifacts/context) is
    // present immediately — not a bare notice.
    expect(within(obsLayer).getByRole('tab', { name: /timeline/i })).toBeInTheDocument();
    expect(within(obsLayer).getByRole('tab', { name: /context/i })).toBeInTheDocument();
    expect(screen.queryByText('Loading observability…')).toBeNull();
    expect(within(obsLayer).getByTestId('obs-pending')).toBeInTheDocument();
  });
});
