/**
 * gact-tui#364 client-half deliverable: `applyMessageLifecycleEvent` now
 * reports `unapplied_unknown_id` (session/messageEvents.ts) when a
 * message-lifecycle SSE event names a message/part id the loaded feed
 * doesn't have — the same shape a dropped or out-of-order frame would
 * produce (H-A). SessionView's live-transcript effect treats that as a
 * divergence signal and reuses its EXISTING debounced reconcile
 * (`client.messages(activeId)` on a 250ms trailing-edge timer, already wired
 * for message.completed/error/deleted) rather than opening a new fetch path.
 *
 * These pin: each of the three unknown-id shapes triggers exactly one
 * reconcile fetch, a BURST of them still coalesces into one (not a storm),
 * and — the counterfactual — an event naming ids the feed DOES have never
 * fires a reconcile at all.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionView } from '../../src/session/SessionView';

const SESSIONS = [
  { id: 'sess_a', title: 'LA ground motion', status: 'running', workspace_id: 'ws_default' },
] as unknown as Session[];

const MESSAGES: Message[] = [
  { id: 'm1', role: 'assistant', parts: [{ type: 'text', id: 'p1', text: 'ready' }] },
] as unknown as Message[];

type Listener = (event: MessageEvent<string>) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Listener[]>();
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: EventListener) {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener as unknown as Listener);
    this.listeners.set(type, bucket);
  }
  removeEventListener(type: string, listener: EventListener) {
    const bucket = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      bucket.filter((l) => l !== (listener as unknown as Listener)),
    );
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data } as MessageEvent<string>);
    }
  }
}

function client(overrides: Record<string, unknown> = {}): Client {
  return {
    baseUrl: 'http://live.test',
    messages: vi.fn(async () => ({ messages: MESSAGES })),
    getSession: vi.fn(async () => ({ id: 'sess_a', workspace_id: 'ws_default' })),
    sseUrl: (id: string) => `http://live.test/v1/sessions/${id}/events`,
    ...overrides,
  } as unknown as Client;
}

async function selectSession(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
  await screen.findByText('ready');
}

function mainSource(): FakeEventSource {
  // The main transcript effect subscribes to every SESSION_MESSAGE_EVENT_TYPES
  // entry (message.created, part.added/updated/delta/completed,
  // message.completed/error/deleted) on ONE EventSource — any of those
  // listener types identifies it.
  const found = FakeEventSource.instances.find((s) => s.listeners.has('message.part.added'));
  if (!found) throw new Error('main transcript EventSource not found');
  return found;
}

function emit(source: FakeEventSource, type: string, payload: Record<string, unknown>) {
  source.emit(type, JSON.stringify({ type, occurred_at: '2026-08-14T00:00:00Z', payload }));
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SessionView reconciles on unapplied_unknown_id (gact-tui#364)', () => {
  it('message.part.added for an unknown message_id triggers the existing debounced reconcile', async () => {
    const messagesFn = vi.fn(async () => ({ messages: MESSAGES }));
    render(<SessionView client={client({ messages: messagesFn })} sessions={SESSIONS} />);
    await selectSession();
    const source = mainSource();
    const callsBefore = messagesFn.mock.calls.length;

    vi.useFakeTimers();
    try {
      await act(async () => {
        emit(source, 'message.part.added', {
          message_id: 'm_ghost',
          part: { type: 'text', id: 'p_ghost', text: 'x' },
        });
        await vi.advanceTimersByTimeAsync(300); // past the 250ms debounce window
      });
    } finally {
      vi.useRealTimers();
    }

    expect(messagesFn.mock.calls.length - callsBefore).toBe(1);
  });

  it('message.part.delta for an unknown part_id triggers the existing debounced reconcile', async () => {
    const messagesFn = vi.fn(async () => ({ messages: MESSAGES }));
    render(<SessionView client={client({ messages: messagesFn })} sessions={SESSIONS} />);
    await selectSession();
    const source = mainSource();
    const callsBefore = messagesFn.mock.calls.length;

    vi.useFakeTimers();
    try {
      await act(async () => {
        emit(source, 'message.part.delta', {
          message_id: 'm1',
          part_id: 'p_ghost',
          delta: { text_append: 'x' },
        });
        await vi.advanceTimersByTimeAsync(300);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(messagesFn.mock.calls.length - callsBefore).toBe(1);
  });

  it('message.part.completed for an unknown part_id triggers the existing debounced reconcile', async () => {
    const messagesFn = vi.fn(async () => ({ messages: MESSAGES }));
    render(<SessionView client={client({ messages: messagesFn })} sessions={SESSIONS} />);
    await selectSession();
    const source = mainSource();
    const callsBefore = messagesFn.mock.calls.length;

    vi.useFakeTimers();
    try {
      await act(async () => {
        emit(source, 'message.part.completed', {
          message_id: 'm1',
          part_id: 'p_ghost',
          final_text: 'final',
        });
        await vi.advanceTimersByTimeAsync(300);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(messagesFn.mock.calls.length - callsBefore).toBe(1);
  });

  it('coalesces a BURST of unknown-id events into exactly ONE reconcile, not a storm', async () => {
    const messagesFn = vi.fn(async () => ({ messages: MESSAGES }));
    render(<SessionView client={client({ messages: messagesFn })} sessions={SESSIONS} />);
    await selectSession();
    const source = mainSource();
    const callsBefore = messagesFn.mock.calls.length;

    vi.useFakeTimers();
    try {
      await act(async () => {
        emit(source, 'message.part.added', { message_id: 'm_ghost_1', part: { type: 'text', id: 'p1', text: 'a' } });
        await vi.advanceTimersByTimeAsync(100); // well under the 250ms debounce window
        emit(source, 'message.part.added', { message_id: 'm_ghost_2', part: { type: 'text', id: 'p2', text: 'b' } });
        await vi.advanceTimersByTimeAsync(100);
        emit(source, 'message.part.added', { message_id: 'm_ghost_3', part: { type: 'text', id: 'p3', text: 'c' } });
        await vi.advanceTimersByTimeAsync(300); // past the debounce window
      });
    } finally {
      vi.useRealTimers();
    }

    expect(messagesFn.mock.calls.length - callsBefore).toBe(1);
  });

  it('never reconciles for an event naming ids the feed already has', async () => {
    const messagesFn = vi.fn(async () => ({ messages: MESSAGES }));
    render(<SessionView client={client({ messages: messagesFn })} sessions={SESSIONS} />);
    await selectSession();
    const source = mainSource();
    const callsBefore = messagesFn.mock.calls.length;

    vi.useFakeTimers();
    try {
      await act(async () => {
        // m1/p1 are the known ids from MESSAGES above.
        emit(source, 'message.part.delta', { message_id: 'm1', part_id: 'p1', delta: { text_append: ' world' } });
        await vi.advanceTimersByTimeAsync(300);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(messagesFn.mock.calls.length - callsBefore).toBe(0);
    // The delta DID apply — the streamed text landed in the transcript.
    expect(screen.getByText('ready world')).toBeInTheDocument();
  });

  // Opus adversarial review, proven defect #1: loadedMessagesRef used to be
  // mirrored via a passive (post-render) useEffect, which lags a full commit
  // behind the mutation it's supposed to reflect. message.created(mN)
  // immediately followed by message.part.added(mN) — the SAME synchronous
  // SSE batch, and the ordinary shape of every turn start (the assistant
  // message shell, then its first streamed part) — exposed the lag:
  // part.added's divergence check ran BEFORE message.created's effect had
  // flushed, saw mN missing, and reported a false unapplied_unknown_id,
  // turning the healthy path into a spurious full-transcript reconcile on
  // EVERY turn. Fixed by writing loadedMessagesRef synchronously at every
  // mutation site instead of via the passive effect.
  it('regression: message.created(mN) then message.part.added(mN) in the SAME synchronous batch — the turn-start shape — triggers ZERO reconciles', async () => {
    const messagesFn = vi.fn(async () => ({ messages: MESSAGES }));
    render(<SessionView client={client({ messages: messagesFn })} sessions={SESSIONS} />);
    await selectSession();
    const source = mainSource();
    const callsBefore = messagesFn.mock.calls.length;

    vi.useFakeTimers();
    try {
      await act(async () => {
        // Back to back, no `await` between them — no yield to the event
        // loop, so this is the SAME synchronous batch the proven repro used.
        emit(source, 'message.created', { id: 'm2', role: 'assistant', parts: [] });
        emit(source, 'message.part.added', {
          message_id: 'm2',
          part: { type: 'text', id: 'p_new', text: 'hello' },
        });
        await vi.advanceTimersByTimeAsync(300);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(messagesFn.mock.calls.length - callsBefore).toBe(0);
    // The part DID land — this is the healthy path working, not a no-op.
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('the counterfactual: a part.added with NO preceding message.created for its message_id is a genuine divergence — exactly ONE reconcile', async () => {
    const messagesFn = vi.fn(async () => ({ messages: MESSAGES }));
    render(<SessionView client={client({ messages: messagesFn })} sessions={SESSIONS} />);
    await selectSession();
    const source = mainSource();
    const callsBefore = messagesFn.mock.calls.length;

    vi.useFakeTimers();
    try {
      await act(async () => {
        // No message.created ever arrived for this message_id — unlike the
        // regression test above, this is a real gap (dropped/out-of-order
        // frame), not the benign turn-start ordering.
        emit(source, 'message.part.added', {
          message_id: 'm_never_created',
          part: { type: 'text', id: 'p_orphan', text: 'x' },
        });
        await vi.advanceTimersByTimeAsync(300);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(messagesFn.mock.calls.length - callsBefore).toBe(1);
  });
});
