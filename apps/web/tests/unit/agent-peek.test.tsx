/**
 * Shift-click agent peek (round-3 defect 1).
 *
 * Prototype rule (goPkrd/goElsc): plain click on a Call box drills the child
 * into the CENTER (steerable); shift-click opens a READ-ONLY view of the
 * child in the 480px RIGHT panel while the main transcript stays put. The
 * live app dropped the `{ peek }` argument in SessionView's
 * `openChildByHandle`, so shift-click was byte-identical to click (round-3
 * DOM dumps app-b vs app-c). These cases pin both routes end to end.
 */
import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { AgentPeekView } from '../../src/session/AgentPeekView';
import { SessionView } from '../../src/session/SessionView';
import { Transcript } from '../../src/transcript/Transcript';

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
  // `metadata.agent_task_id` matches SETTLED_HANDOFF's own `handle_id` — the
  // real wire marker clio's delegation-launch path stamps on a genuine
  // spawned child's first message (clio#1218d), which is what makes this
  // fixture a real delegation brief rather than an ordinary pushed message.
  {
    id: 'c1',
    role: 'user',
    parts: [{ type: 'text', text: 'Resolve LA into coordinates.' }],
    metadata: { agent_task_id: 'task_8562bd68e4d5', spawned_by: 'main' },
  },
  { id: 'c2', role: 'assistant', parts: [{ type: 'text', text: 'Center resolved: 34.0537, -118.2428.' }] },
] as unknown as Message[];

function peekClient(overrides: Record<string, unknown> = {}): Client {
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
            {
              task_id: 'task_8562bd68e4d5',
              status: 'completed',
              child_session_id: 'sess_child',
            },
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

describe('AgentPeekView (right-panel read-only child view)', () => {
  // final-sxs ledger #3: the header is TWO rows — "AGENT · <status>" eyebrow
  // (StatusDot still rides this row) then "session › <agent>" breadcrumb —
  // replacing the single chip-row this used to pin.
  it('renders the two-row header (AGENT · status eyebrow, session › agent crumb) and its own prompt-from fold', async () => {
    render(
      <AgentPeekView
        client={peekClient()}
        sessionId="sess_child"
        agent="geospatial"
        parentLabel="main"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('agent-peek')).toBeInTheDocument();
    // The eyebrow row states WHAT is being peeked and its live status
    // together, "AGENT · <status>" — the StatusDot still rides this row.
    const eyebrow = await screen.findByTestId('agent-peek-eyebrow');
    expect(eyebrow).toHaveTextContent('AGENT · completed');
    expect(screen.getByTestId('agent-peek').querySelector('.kit-statusdot')).not.toBeNull();
    // The breadcrumb row names the child agent in its own element.
    expect(screen.getByTestId('agent-peek-name')).toHaveTextContent('geospatial');
    expect(screen.getByText('session')).toBeInTheDocument();
    expect(screen.getByText('›')).toBeInTheDocument();
    // The child's first user message carries `metadata.agent_task_id` — a
    // genuine delegation brief (clio#1218d) — so it gets its own fold.
    expect(screen.getByRole('button', { name: /prompt from main/ })).toBeInTheDocument();
    // The child transcript renders through the shared grammar.
    expect(screen.getByText('Center resolved: 34.0537, -118.2428.')).toBeInTheDocument();
  });

  it('drops ChildFocusView\'s own trailing status footer — the eyebrow row already states it (final-sxs ledger #3)', async () => {
    render(
      <AgentPeekView
        client={peekClient()}
        sessionId="sess_child"
        agent="geospatial"
        parentLabel="main"
        onClose={vi.fn()}
      />,
    );
    const view = await screen.findByTestId('child-focus-view');
    expect(view.querySelector('.childfocus__status')).toBeNull();
  });

  it('is read-only: no composer input mounts inside the peek', async () => {
    render(
      <AgentPeekView
        client={peekClient()}
        sessionId="sess_child"
        agent="geospatial"
        parentLabel="main"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('child-focus-view')).toBeInTheDocument());
    expect(within(screen.getByTestId('agent-peek')).queryByRole('textbox')).toBeNull();
  });

  it('closes through its own header control', async () => {
    const onClose = vi.fn();
    render(
      <AgentPeekView
        client={peekClient()}
        sessionId="sess_child"
        agent="geospatial"
        parentLabel="main"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /close peek/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('shift-click selection guard (owner defect 1)', () => {
  // Shift-mousedown's browser default is "extend the native text selection
  // to the click point" — it fired BEFORE the peek handler and painted a
  // selection across the whole transcript. The box kills the default at
  // mousedown for shift only; a plain mousedown keeps its default (caret
  // placement, drag-select) untouched.
  it('prevents the default on shift-mousedown so no selection extends', () => {
    const onOpenChild = vi.fn();
    render(
      <Transcript
        messages={[{ id: 'm2', role: 'assistant', parts: [SETTLED_HANDOFF] }] as unknown as Message[]}
        onOpenChild={onOpenChild}
      />,
    );
    const box = screen.getByTestId('part-child-card');
    const shiftDown = createEvent.mouseDown(box, { shiftKey: true });
    fireEvent(box, shiftDown);
    expect(shiftDown.defaultPrevented).toBe(true);
    // The click itself still routes to the peek.
    fireEvent.click(box, { shiftKey: true });
    expect(onOpenChild).toHaveBeenCalledWith('task_8562bd68e4d5', 'geospatial', { peek: true });
  });

  it('leaves a plain mousedown default alone', () => {
    render(
      <Transcript
        messages={[{ id: 'm2', role: 'assistant', parts: [SETTLED_HANDOFF] }] as unknown as Message[]}
        onOpenChild={vi.fn()}
      />,
    );
    const box = screen.getByTestId('part-child-card');
    const plainDown = createEvent.mouseDown(box);
    fireEvent(box, plainDown);
    expect(plainDown.defaultPrevented).toBe(false);
  });
});

describe('SessionView peek routing (openChildByHandle receives { peek })', () => {
  it('shift-click on a Call box opens the RIGHT peek and keeps the main transcript', async () => {
    render(<SessionView client={peekClient()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    const card = await screen.findByTestId('part-child-card');

    fireEvent.click(card, { shiftKey: true });

    const peek = await screen.findByTestId('agent-peek');
    // The peek mounts the child read-only view on the RIGHT…
    await waitFor(() =>
      expect(within(peek).getByTestId('child-focus-view')).toBeInTheDocument(),
    );
    expect(within(peek).getByTestId('agent-peek-eyebrow')).toHaveTextContent(/^AGENT/);
    // …while the CENTER still shows the parent transcript's Call box.
    expect(screen.getByTestId('part-child-card')).toBeInTheDocument();
    expect(screen.getByText('map the stations')).toBeInTheDocument();
  });

  it('plain click still drills into the CENTER child view (unchanged behavior)', async () => {
    render(<SessionView client={peekClient()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    const card = await screen.findByTestId('part-child-card');

    fireEvent.click(card);

    await waitFor(() => expect(screen.getByTestId('child-focus-view')).toBeInTheDocument());
    // No right peek for a plain click.
    expect(screen.queryByTestId('agent-peek')).toBeNull();
  });

  // final-sxs ledger #5: a settled child's composer states that sending a
  // message REAWAKENS it, rather than leaving the generic main-session copy
  // in place as though this were an ordinary, still-live conversation.
  it('a settled child\'s composer carries the reawaken placeholder + amber notice', async () => {
    render(<SessionView client={peekClient()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    const card = await screen.findByTestId('part-child-card');
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByTestId('child-focus-view')).toBeInTheDocument());

    // sess_child's stubbed getSession resolves status: 'completed' — settled.
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Message geospatial to reawaken it')).toBeInTheDocument(),
    );
    const notice = screen.getByTestId('reawaken-notice');
    expect(notice).toHaveTextContent(
      'This agent finished and returned to main. Sending a message reawakens it with its full context.',
    );
  });
});
