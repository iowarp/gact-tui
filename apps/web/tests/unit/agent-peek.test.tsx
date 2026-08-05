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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { AgentPeekView } from '../../src/session/AgentPeekView';
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
  it('renders the AGENT header with the child status and its own prompt-from fold', async () => {
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
    expect(screen.getByText('AGENT')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('agent-peek-status')).toHaveTextContent('· completed'),
    );
    // The child's first user message IS the delegation brief — its own fold.
    expect(screen.getByRole('button', { name: /prompt from main/ })).toBeInTheDocument();
    // The child transcript renders through the shared grammar.
    expect(screen.getByText('Center resolved: 34.0537, -118.2428.')).toBeInTheDocument();
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
    expect(within(peek).getByText('AGENT')).toBeInTheDocument();
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
});
