/**
 * Center-nav back/forward wiring (Feature C, owner 2026-08-06: "the
 * prototype wires popstate for back/forward through views"). The pure
 * reducer + scroll-map bookkeeping is covered DOM-free in
 * navHistory.test.ts; these cases pin the part that module can't reach —
 * SessionView's actual `window.history`/`popstate` calls.
 *
 * jsdom does no real layout, so `scrollTop` is just a plain read/write
 * number with no scrollHeight-driven clamping — good enough to assert the
 * BOOKKEEPING (what gets captured into the pushed state, what a popstate
 * hands back) without needing a real browser. The live probe
 * (screenshots/nav-history/) covers the pixel-level restore end to end.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionView } from '../../src/session/SessionView';

const SETTLED_HANDOFF = {
  type: 'expert_handoff',
  id: 'live_handoff_cc313c90a8c5',
  agent_id: 'main',
  text: 'main -> geospatial',
  parent_agent: 'main',
  child_agent: 'geospatial',
  stage: 'delegate.completed',
  handle_id: 'task_8562bd68e4d5',
  run_label: 'geospatial #1',
  live_state: 'completed',
  host: 'local',
  placement: 'local',
  status: 'completed',
  duration_ms: 72000,
  metadata: {
    question: 'Resolve LA into coordinates.',
    output: 'Resolved LA to center 34.0537, -118.2428.',
  },
};

const PARENT_MESSAGES: Message[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'map the stations' }] },
  { id: 'm2', role: 'assistant', parts: [SETTLED_HANDOFF] },
] as unknown as Message[];

const CHILD_MESSAGES: Message[] = [
  { id: 'c1', role: 'user', parts: [{ type: 'text', text: 'Resolve LA into coordinates.' }] },
  { id: 'c2', role: 'assistant', parts: [{ type: 'text', text: 'Center resolved.' }] },
] as unknown as Message[];

function navClient(overrides: Record<string, unknown> = {}): Client {
  return {
    baseUrl: 'http://live.test',
    sseUrl: (id: string) => `http://live.test/v1/sessions/${id}/events`,
    messages: vi.fn(async (id: string) => ({
      messages: id === 'sess_child' ? CHILD_MESSAGES : PARENT_MESSAGES,
    })),
    getSession: vi.fn(async (id: string) =>
      id === 'sess_child' ? { id, status: 'completed' } : { id, status: 'idle' },
    ),
    get: vi.fn(async (path: string) => {
      if (path.includes('/agent-tasks')) {
        return {
          tasks: [
            { task_id: 'task_8562bd68e4d5', status: 'completed', child_session_id: 'sess_child' },
          ],
        };
      }
      if (path.includes('/artifacts')) return { artifacts: [], count: 0 };
      throw new Error(`unstubbed GET ${path}`);
    }),
    ...overrides,
  } as unknown as Client;
}

const SESSIONS = [
  { id: 'sess_a', title: 'LA ground motion', status: 'idle', workspace_id: 'ws_default' },
] as unknown as Session[];

// Every push/replace this session made, most recent last — cheaper to read
// back than re-parsing jsdom's live `history.state` after each assertion.
function historySpy() {
  const pushed: unknown[] = [];
  const pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation((state) => {
    pushed.push(state);
  });
  const replaceSpy = vi.spyOn(window.history, 'replaceState').mockImplementation((state) => {
    pushed.push(state);
  });
  return { pushed, pushSpy, replaceSpy };
}

describe('center-nav history wiring', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drilling into a child via Call-box click pushes ONE history entry recording the LEFT view scrollTop', async () => {
    const { pushed, pushSpy } = historySpy();
    render(<SessionView client={navClient()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    const card = await screen.findByTestId('part-child-card');

    // Fake-scroll the main transcript (jsdom: a plain settable number, no
    // real layout) BEFORE navigating away from it.
    const scroller = document.querySelector('.transcript') as HTMLDivElement;
    expect(scroller).not.toBeNull();
    scroller.scrollTop = 340;

    const pushCallsBefore = pushSpy.mock.calls.length;
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByTestId('child-focus-view')).toBeInTheDocument());

    expect(pushSpy.mock.calls.length).toBe(pushCallsBefore + 1);
    const entry = pushed[pushed.length - 1] as {
      value: { activeId: string | null; focus: { sessionId: string; agent: string }[]; scroll: Record<string, number> };
    };
    expect(entry.value.focus).toEqual([{ sessionId: 'sess_child', agent: 'geospatial' }]);
    expect(entry.value.activeId).toBe('sess_a');
    // The view being LEFT (main, keyed by its own session id) kept its
    // pre-navigation scrollTop.
    expect(entry.value.scroll.sess_a).toBe(340);
  });

  it('regression: the entry being LEFT is amended with fresh scroll BEFORE pushing (a live-probe-caught bug — history entries are immutable snapshots, so pushing forward must first replaceState the current entry or Back finds a stale/empty scroll map)', async () => {
    const { pushed } = historySpy();
    render(<SessionView client={navClient()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    const card = await screen.findByTestId('part-child-card');

    const scroller = document.querySelector('.transcript') as HTMLDivElement;
    scroller.scrollTop = 340;
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByTestId('child-focus-view')).toBeInTheDocument());

    // The entry a real Back lands on (one below the pushed child entry)
    // must carry the 340 captured at push time, not the empty scroll map
    // it was originally created with when the session was first selected.
    const entryBack = pushed[pushed.length - 2] as { value: { scroll: Record<string, number> } };
    expect(entryBack.value.scroll.sess_a).toBe(340);

    fireEvent(window, new PopStateEvent('popstate', { state: entryBack }));
    await waitFor(() => expect(screen.queryByTestId('child-focus-view')).toBeNull());
    // The DOM actually ends up restored, not just the state object.
    await waitFor(() => expect(scroller.scrollTop).toBe(340));
  });

  it('a popstate back to the parent restores state WITHOUT pushing a new history entry (the loop guard)', async () => {
    const { pushed, pushSpy } = historySpy();
    render(<SessionView client={navClient()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    const card = await screen.findByTestId('part-child-card');
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByTestId('child-focus-view')).toBeInTheDocument());

    const pushedAfterDrill = pushed[pushed.length - 1] as { [k: string]: unknown };
    const pushCallsAfterDrill = pushSpy.mock.calls.length;

    // Simulate browser Back: the entry BEFORE the drill (the session's own
    // baseline, focus: []) is what a real Back would hand to popstate.
    const baselineEntry = pushed[pushed.length - 2];
    fireEvent(window, new PopStateEvent('popstate', { state: baselineEntry }));

    await waitFor(() => expect(screen.queryByTestId('child-focus-view')).toBeNull());
    expect(screen.getByText('map the stations')).toBeInTheDocument();
    // Applying a popped state must NEVER itself call pushState/replaceState
    // — that would re-push Forward immediately and break the Back button.
    expect(pushSpy.mock.calls.length).toBe(pushCallsAfterDrill);
    expect(pushedAfterDrill).not.toBe(baselineEntry); // sanity: these were genuinely different entries
  });

  it('a popstate forward re-enters the child (focus restored from the popped state)', async () => {
    const { pushed } = historySpy();
    render(<SessionView client={navClient()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    const card = await screen.findByTestId('part-child-card');
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByTestId('child-focus-view')).toBeInTheDocument());

    const childEntry = pushed[pushed.length - 1];
    const baselineEntry = pushed[pushed.length - 2];

    // Back...
    fireEvent(window, new PopStateEvent('popstate', { state: baselineEntry }));
    await waitFor(() => expect(screen.queryByTestId('child-focus-view')).toBeNull());

    // ...then Forward.
    fireEvent(window, new PopStateEvent('popstate', { state: childEntry }));
    await waitFor(() => expect(screen.getByTestId('child-focus-view')).toBeInTheDocument());
  });

  it('the breadcrumb "main" crumb click pushes a history entry back to the root', async () => {
    const { pushed, pushSpy } = historySpy();
    render(<SessionView client={navClient()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    const card = await screen.findByTestId('part-child-card');
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByTestId('child-focus-view')).toBeInTheDocument());

    const pushCallsAfterDrill = pushSpy.mock.calls.length;
    fireEvent.click(screen.getByRole('tab', { name: 'main' }));
    await waitFor(() => expect(screen.queryByTestId('child-focus-view')).toBeNull());

    expect(pushSpy.mock.calls.length).toBe(pushCallsAfterDrill + 1);
    const entry = pushed[pushed.length - 1] as { value: { focus: unknown[] } };
    expect(entry.value.focus).toEqual([]);
  });

  it('selecting a session replaces (not pushes) a fresh history baseline', async () => {
    const { pushed, pushSpy, replaceSpy } = historySpy();
    render(<SessionView client={navClient()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    await waitFor(() => expect(screen.getByText('map the stations')).toBeInTheDocument());

    expect(replaceSpy).toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    const baseline = pushed[pushed.length - 1] as {
      value: { activeId: string | null; focus: unknown[] };
    };
    expect(baseline.value).toEqual({ activeId: 'sess_a', focus: [], scroll: {} });
  });
});
