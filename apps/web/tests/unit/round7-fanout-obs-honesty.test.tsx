/**
 * Round-7 FANOUT live finding (screenshots/round7/2026-08-06_05-05-59-
 * FANOUT-*.png, fanout.log): under a heavy multi-child streaming session,
 * the observability layer took 33414ms to OPEN (click -> first rendered
 * row) while the backend's own trace read answered in 2733ms. Two distinct
 * root causes, both in SessionView's observability wiring:
 *
 *  1. `loadObservability`'s network effect depended on the live
 *     `observabilityMessages` array — a NEW reference on every streaming
 *     SSE delta / progressive-backfill page — so the effect (and its SSE-
 *     subscribing sibling) re-fired the ENTIRE multi-fetch chain on every
 *     single message update instead of once per obs-panel-open. Under
 *     heavy fan-out this queued dozens of overlapping fetch batches behind
 *     the browser's per-origin connection cap.
 *  2. The child-trace fan-out (which only needs agentTasks + artifacts to
 *     resolve) was gated behind a SINGLE `Promise.all([...7])` that also
 *     included agents/sessionTasks/mcpServers/context/rootTrace — a slow
 *     unrelated read delayed work that was otherwise ready to start.
 *
 * Alongside this, the obs TAB STRIP badges (runs/tools/artifacts) read a
 * confident "0" under a failed read in the SAME frame the tab BODY already
 * rendered the honest "unavailable — retrying" — the round-6 no-silent-
 * fallback treatment reached the body but missed the strip.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { SessionView } from '../../src/session/SessionView';

const SESSIONS = [
  { id: 'sess_a', title: 'earthscope fanout', status: 'running', workspace_id: 'ws_default' },
] as unknown as Session[];

const MESSAGES: Message[] = [
  { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'ready' }] },
] as unknown as Message[];

function msg(id: string, text: string): Message {
  return { id, role: 'assistant', parts: [{ type: 'text', text }] } as unknown as Message;
}

/** A promise the test resolves on its own schedule (session-view.test.tsx's own helper). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function selectSession(name = 'earthscope fanout'): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name }));
}

async function openObservability(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Observability' }));
  return screen.findByRole('dialog', { name: /observability/i });
}

// ---- 1. the load-storm: streaming messages must not re-fire the fetch chain ----

describe('obs load storm — loadObservability does not re-fire on every streaming messages update', () => {
  it('fires the observability fetch chain ONCE for the open, not once per progressive-backfill page', async () => {
    // Newest page paints immediately; two OLDER pages backfill in the
    // background afterward — each a genuinely NEW `state.messages` array
    // reference, exactly like a live SSE delta would produce.
    const page1 = { messages: [msg('m1', 'newest page')], next_cursor: 'c1' };
    const page2 = deferred<{ messages: Message[]; next_cursor: string | null }>();
    const page3 = deferred<{ messages: Message[]; next_cursor: string | null }>();

    const messagesMock = vi.fn(async (_id: string, opts?: { before?: string }) => {
      if (!opts?.before) return page1;
      if (opts.before === 'c1') return page2.promise;
      if (opts.before === 'c2') return page3.promise;
      throw new Error(`unexpected cursor ${opts.before}`);
    });
    // agents/sessionTasks/mcpServers are called EXCLUSIVELY by
    // loadObservability (grep-verified) — their call count is a clean proxy
    // for "how many times has the fetch chain fired".
    const mcpServers = vi.fn(async () => ({ servers: [] }));

    const client: Client = {
      baseUrl: 'http://live.test',
      messages: messagesMock,
      agents: vi.fn(async () => ({ agents: [] })),
      sessionTasks: vi.fn(async () => ({ tasks: [] })),
      mcpServers,
      get: vi.fn(async (path: string) => {
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/artifacts')) return { artifacts: [] };
        if (path.includes('/context')) return { used_pct: 0.1 };
        if (path.includes('/trace')) return { events: [] };
        throw new Error(`unstubbed GET ${path}`);
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();
    await screen.findByText('newest page');

    await openObservability();
    await waitFor(() => expect(mcpServers).toHaveBeenCalledTimes(1));
    const callsAfterOpen = mcpServers.mock.calls.length;

    // Backfill page 1 lands while the obs panel is still open.
    page2.resolve({ messages: [msg('m2', 'older page one')], next_cursor: 'c2' });
    await screen.findByText('older page one');
    await new Promise((r) => setTimeout(r, 0));

    // Backfill page 2 (the last one) lands too.
    page3.resolve({ messages: [msg('m3', 'older page two')], next_cursor: null });
    await screen.findByText('older page two');
    await new Promise((r) => setTimeout(r, 0));

    // The fetch chain must not have re-fired for either backfill page.
    expect(mcpServers.mock.calls.length).toBe(callsAfterOpen);
  });

  it('does not gate the child-trace fan-out behind a slow unrelated read (e.g. mcpServers)', async () => {
    // mcpServers never resolves for the life of this test — a genuinely
    // slow/hung unrelated read must not hold up work that only depends on
    // agentTasks + artifacts.
    const mcpServers = vi.fn(() => new Promise<never>(() => {}));
    const getCalls: string[] = [];

    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      agents: vi.fn(async () => ({ agents: [] })),
      sessionTasks: vi.fn(async () => ({ tasks: [] })),
      mcpServers,
      get: vi.fn(async (path: string) => {
        getCalls.push(path);
        if (path.includes('/agent-tasks')) {
          return { tasks: [{ task_id: 't1', status: 'running', child_session_id: 'sess_child' }] };
        }
        if (path.includes('/artifacts')) return { artifacts: [] };
        if (path.includes('/context')) return { used_pct: 0.1 };
        if (path.includes('/trace')) return { events: [] };
        throw new Error(`unstubbed GET ${path}`);
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();
    await screen.findByText('ready');
    await openObservability();

    await waitFor(() =>
      expect(getCalls.some((p) => p.includes('sess_child') && p.includes('/trace'))).toBe(true),
    );
  });
});

// ---- 2. obs tab-strip badges: unresolved must read "—", never a false "0" ----

describe('obs tab-strip badges — an unresolved read renders "—", never a confident "0"', () => {
  it('runs + tools badges read "—" (not "0") when the trace read fails, alongside the body\'s existing honesty', async () => {
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      get: vi.fn(async (path: string) => {
        if (path.includes('/trace')) throw new Error('timeout under fan-out');
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/context')) return { used_pct: 0 };
        if (path.includes('/artifacts')) return { artifacts: [] };
        throw new Error(`unstubbed GET ${path}`);
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();
    const obsLayer = await openObservability();

    const runsTab = await within(obsLayer).findByRole('tab', { name: /^runs/i });
    const toolsTab = within(obsLayer).getByRole('tab', { name: /^tools/i });
    await waitFor(() => expect(runsTab).toHaveTextContent('—'));
    expect(toolsTab).toHaveTextContent('—');
    expect(runsTab).not.toHaveTextContent('0');
    expect(toolsTab).not.toHaveTextContent('0');

    // The tab BODY already got this right (round-6) — still true alongside
    // the strip fix.
    fireEvent.click(runsTab);
    expect(await within(obsLayer).findByTestId('obs-unavailable')).toHaveTextContent(/runs unavailable/i);
  });

  it('the artifacts badge reads "—" when ONLY the artifacts read fails, independent of a healthy trace read', async () => {
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      get: vi.fn(async (path: string) => {
        if (path.includes('/artifacts')) throw new Error('timeout under fan-out');
        if (path.includes('/trace')) return { events: [] };
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/context')) return { used_pct: 0 };
        throw new Error(`unstubbed GET ${path}`);
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();
    const obsLayer = await openObservability();

    const artifactsTab = await within(obsLayer).findByRole('tab', { name: /artifacts/i });
    await waitFor(() => expect(artifactsTab).toHaveTextContent('—'));

    // The trace-derived badges stayed a real, resolved "0" — only artifacts
    // is unresolved here, because it's a DIFFERENT read.
    const runsTab = within(obsLayer).getByRole('tab', { name: /^runs/i });
    expect(runsTab).toHaveTextContent('0');
    expect(runsTab).not.toHaveTextContent('—');

    fireEvent.click(artifactsTab);
    expect(await within(obsLayer).findByTestId('obs-unavailable')).toHaveTextContent(
      /artifacts unavailable/i,
    );
  });

  it('regression pin: every badge still shows a real "0" (never "—") once every read genuinely succeeds empty', async () => {
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      get: vi.fn(async (path: string) => {
        if (path.includes('/trace')) return { events: [] };
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/context')) return { used_pct: 0 };
        if (path.includes('/artifacts')) return { artifacts: [] };
        throw new Error(`unstubbed GET ${path}`);
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();
    const obsLayer = await openObservability();

    const runsTab = await within(obsLayer).findByRole('tab', { name: /^runs/i });
    await waitFor(() => expect(runsTab).toHaveTextContent('0'));
    const toolsTab = within(obsLayer).getByRole('tab', { name: /^tools/i });
    const artifactsTab = within(obsLayer).getByRole('tab', { name: /artifacts/i });
    for (const tab of [runsTab, toolsTab, artifactsTab]) {
      expect(tab).toHaveTextContent('0');
      expect(tab).not.toHaveTextContent('—');
    }
  });
});
