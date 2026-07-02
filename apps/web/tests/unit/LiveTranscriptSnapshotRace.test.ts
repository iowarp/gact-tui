import { createRoot, createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Client, Message } from '@clio/core';
import { createLiveTranscript } from '../../src/LiveTranscript.js';

/**
 * Regression for iowarp/gact-tui#226: the initial snapshot fetch and
 * `refetch()` were not disposal-guarded. Switching sessions A → B while A's
 * fetch was in flight let A's late resolution render A's transcript into B's
 * pane, and a late A failure wiped B's loaded messages. The stale fetch must
 * be discarded — the same current-session guard the Go TUI applies in
 * `tui/internal/ui/message_load_commands.go`.
 */

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function ids(messages: Message[]): string[] {
  return messages.map((m) => m.id);
}

function msg(id: string, text: string): Message {
  return {
    id,
    role: 'assistant',
    parts: [{ id: `${id}_p1`, type: 'text', text }],
  } as Message;
}

/** Minimal EventSource stub so the transcript's SSE connection is inert. */
class StubEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}

let originalEventSource: typeof EventSource | undefined;

beforeEach(() => {
  originalEventSource = globalThis.EventSource;
  (globalThis as { EventSource: unknown }).EventSource =
    StubEventSource as unknown as typeof EventSource;
});

afterEach(() => {
  (globalThis as { EventSource: unknown }).EventSource = originalEventSource;
});

interface Harness {
  client: Client;
  /** Resolve the OLDEST outstanding `messages(sessionId)` call. */
  resolveMessages: (sessionId: string, messages: Message[]) => void;
  /** Reject the OLDEST outstanding `messages(sessionId)` call. */
  rejectMessages: (sessionId: string, error: unknown) => void;
}

/** Per-session deferred queue so two sessions' fetches can race out of order. */
function harness(): Harness {
  const pending = new Map<
    string,
    Array<{ resolve: (v: { messages: Message[] }) => void; reject: (e: unknown) => void }>
  >();
  const client = {
    sseUrl: () => 'http://localhost/sse',
    messages: (sessionId: string) => {
      const d = deferred<{ messages: Message[] }>();
      const queue = pending.get(sessionId) ?? [];
      queue.push(d);
      pending.set(sessionId, queue);
      return d.promise;
    },
    permissions: () => Promise.resolve({ permissions: [] }),
    sessionQuestions: () => Promise.resolve({ questions: [] }),
  } as unknown as Client;
  const shift = (sessionId: string) => {
    const d = pending.get(sessionId)?.shift();
    if (!d) throw new Error(`no outstanding messages() call for ${sessionId}`);
    return d;
  };
  return {
    client,
    resolveMessages: (sessionId, messages) => shift(sessionId).resolve({ messages }),
    rejectMessages: (sessionId, error) => shift(sessionId).reject(error),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 1));

describe('LiveTranscript snapshot race (#226)', () => {
  it("discards session A's late snapshot after switching to session B", async () => {
    await createRoot(async (dispose) => {
      const h = harness();
      const [sessionId, setSessionId] = createSignal('sA');
      const handle = createLiveTranscript(h.client, sessionId);
      await Promise.resolve();

      // Switch A -> B while A's initial snapshot fetch is still in flight.
      setSessionId('sB');
      await Promise.resolve();

      // B's snapshot lands first.
      h.resolveMessages('sB', [msg('mB', 'B transcript')]);
      await flush();
      expect(ids(handle.messages())).toEqual(['mB']);

      // A resolves LATE — it must be discarded, not rendered into B's pane.
      h.resolveMessages('sA', [msg('mA', 'A transcript')]);
      await flush();
      expect(ids(handle.messages())).toEqual(['mB']);
      expect(handle.messagesLoading()).toBe(false);
      dispose();
    });
  });

  it("ignores session A's late snapshot FAILURE instead of wiping session B", async () => {
    await createRoot(async (dispose) => {
      const h = harness();
      const [sessionId, setSessionId] = createSignal('sA');
      const handle = createLiveTranscript(h.client, sessionId);
      await Promise.resolve();

      setSessionId('sB');
      await Promise.resolve();

      h.resolveMessages('sB', [msg('mB', 'B transcript')]);
      await flush();
      expect(ids(handle.messages())).toEqual(['mB']);

      // A's fetch fails LATE — must not clear B's loaded feed.
      h.rejectMessages('sA', new Error('boom'));
      await flush();
      expect(ids(handle.messages())).toEqual(['mB']);
      dispose();
    });
  });

  it('discards a refetch() snapshot when the active session changed mid-flight', async () => {
    await createRoot(async (dispose) => {
      const h = harness();
      const [sessionId, setSessionId] = createSignal('sA');
      const handle = createLiveTranscript(h.client, sessionId);

      // Boot session A normally.
      await Promise.resolve();
      h.resolveMessages('sA', [msg('mA', 'A transcript')]);
      await flush();
      expect(ids(handle.messages())).toEqual(['mA']);

      // Start a refetch for A, then switch to B before it resolves.
      const done = handle.refetch();
      await Promise.resolve();
      setSessionId('sB');
      await Promise.resolve();
      h.resolveMessages('sB', [msg('mB', 'B transcript')]);
      await flush();
      expect(ids(handle.messages())).toEqual(['mB']);

      // A's refetch resolves LATE — it must not merge A's feed into B's pane.
      h.resolveMessages('sA', [msg('mA2', 'A refetched')]);
      await done;
      await flush();
      expect(ids(handle.messages())).toEqual(['mB']);
      dispose();
    });
  });
});
