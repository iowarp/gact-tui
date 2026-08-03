import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';
import type { Client, Message } from '@clio/core';
import { createTranscriptReconciler } from '../../src/LiveTranscriptReconcile.js';

/**
 * Regression: the debounced reconciler MERGEs the `/v1/messages` snapshot into
 * the local feed (key-based, by message + part id) rather than wholesale
 * replacing it. A `message.part.delta` text-append that races the in-flight
 * fetch must survive — the stale snapshot must not clobber it.
 */

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function textOf(m: Message): string {
  const p = m.parts[0] as { text?: string } | undefined;
  return p?.text ?? '';
}

describe('createTranscriptReconciler (merge-not-replace)', () => {
  it('preserves an in-flight text-append delivered during the reconcile fetch', async () => {
    await createRoot(async (dispose) => {
      const [messages, setMessages] = createSignal<Message[]>([
        { id: 'm1', role: 'assistant', parts: [{ id: 'p1', type: 'text', text: 'Hello' }] },
      ]);

      // The fetch resolves on our command, so we can inject an SSE mutation
      // *while it is in flight*.
      const pending = deferred<{ messages: Message[] }>();
      const client = {
        messages: () => pending.promise,
      } as unknown as Client;

      const reconciler = createTranscriptReconciler({
        client,
        sessionId: 's1',
        setMessages,
        isDisposed: () => false,
        delayMs: 0,
      });

      reconciler.schedule();
      // Let the debounce timer fire and issue the (still-pending) fetch.
      await new Promise((r) => setTimeout(r, 1));

      // SSE delta lands DURING the fetch: append ", world" to p1.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === 'm1'
            ? { ...m, parts: [{ id: 'p1', type: 'text', text: 'Hello, world' }] }
            : m,
        ),
      );

      // Now the (stale) snapshot resolves: server only knows "Hello".
      pending.resolve({
        messages: [
          { id: 'm1', role: 'assistant', parts: [{ id: 'p1', type: 'text', text: 'Hello' }] },
        ],
      });
      await pending.promise;
      await new Promise((r) => setTimeout(r, 1));

      // The newer local text survives the reconcile (merge, not replace).
      expect(textOf(messages()[0]!)).toBe('Hello, world');
      dispose();
    });
  });

  it('keeps a local-only message created during the fetch', async () => {
    await createRoot(async (dispose) => {
      const [messages, setMessages] = createSignal<Message[]>([
        { id: 'm1', role: 'user', parts: [] },
      ]);
      const pending = deferred<{ messages: Message[] }>();
      const client = { messages: () => pending.promise } as unknown as Client;

      const reconciler = createTranscriptReconciler({
        client,
        sessionId: 's1',
        setMessages,
        isDisposed: () => false,
        delayMs: 0,
      });
      reconciler.schedule();
      await new Promise((r) => setTimeout(r, 1));

      // A brand-new message arrives via SSE during the fetch.
      setMessages((prev) => [...prev, { id: 'm2', role: 'assistant', parts: [] }]);

      pending.resolve({ messages: [{ id: 'm1', role: 'user', parts: [] }] });
      await pending.promise;
      await new Promise((r) => setTimeout(r, 1));

      expect(messages().map((m) => m.id)).toEqual(['m1', 'm2']);
      dispose();
    });
  });
});
