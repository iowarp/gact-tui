import { createRoot, createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client, Message } from '@clio/core';
import { createLiveTranscript } from '../../src/LiveTranscript.js';

/**
 * Regression: `createLiveTranscript().refetch()` MERGEs the `/v1/messages`
 * snapshot into the local feed (key-based, by message + part id) rather than
 * wholesale replacing it — the same conflict-free merge the debounced
 * reconciler already uses. An SSE mutation (`message.part.delta` text-append,
 * `cost.updated`, `message.completed`) that has updated the live feed but not
 * yet reached the server must survive the refetch; a stale snapshot must not
 * clobber it.
 *
 * Before the fix, line ~155 did `setMessages(snapshot.messages)` — a wholesale
 * replace — which dropped the in-flight delta. This test fails against that and
 * passes against the merge.
 */

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function textOf(m: Message | undefined): string {
  const p = m?.parts[0] as { text?: string } | undefined;
  return p?.text ?? '';
}

/**
 * Controllable fetch/ReadableStream SSE stub. The browser transport now uses a
 * fetch-based reader (not EventSource), so instead of capturing per-event-name
 * listeners we push SSE event blocks into the response body's stream and let
 * the reader loop drive them through the reducer — the same path the live
 * stream uses.
 */
const encoder = new TextEncoder();
let sseController: ReadableStreamDefaultController<Uint8Array> | null = null;

function installFetchStub(): void {
  sseController = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          sseController = controller;
        },
      }),
    })) as unknown as typeof fetch,
  );
}

/** Push one SSE event block into the stream and let the reader process it. */
async function dispatchSse(type: string, payload: unknown): Promise<void> {
  if (!sseController) throw new Error('SSE stream not open');
  const envelope = { type, occurred_at: new Date().toISOString(), payload };
  sseController.enqueue(encoder.encode(`data: ${JSON.stringify(envelope)}\n\n`));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  installFetchStub();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sseController = null;
});

interface Harness {
  client: Client;
  /** Resolve the next outstanding `messages()` call with this snapshot. */
  resolveMessages: (messages: Message[]) => void;
}

function harness(): Harness {
  let pending: { resolve: (v: { messages: Message[] }) => void } | null = null;
  const client = {
    sseUrl: () => 'http://localhost/sse',
    messages: () => {
      const d = deferred<{ messages: Message[] }>();
      pending = d;
      return d.promise;
    },
    permissions: () => Promise.resolve({ permissions: [] }),
    sessionQuestions: () => Promise.resolve({ questions: [] }),
  } as unknown as Client;
  return {
    client,
    resolveMessages: (messages) => {
      const p = pending;
      pending = null;
      p?.resolve({ messages });
    },
  };
}

describe('createLiveTranscript().refetch (merge-not-replace)', () => {
  it('preserves an in-flight message.part.delta across a stale refetch', async () => {
    await createRoot(async (dispose) => {
      const initial: Message[] = [
        { id: 'm1', role: 'assistant', parts: [{ id: 'p1', type: 'text', text: 'Hello' }] },
      ];
      const h = harness();
      const [sessionId] = createSignal('s1');
      const handle = createLiveTranscript(h.client, sessionId);

      // Boot: drain the session-start snapshot fetch so the feed is `initial`.
      await Promise.resolve();
      h.resolveMessages(initial);
      await new Promise((r) => setTimeout(r, 1));
      expect(textOf(handle.messages()[0])).toBe('Hello');

      // A live SSE delta appends ", world" to p1. This mutates the local feed
      // ahead of the server (the snapshot below is stale for it).
      await dispatchSse('message.part.delta', {
        message_id: 'm1',
        part_id: 'p1',
        delta: { text_append: ', world' },
      });
      expect(textOf(handle.messages()[0])).toBe('Hello, world');

      // Now a refetch races: its snapshot still only knows "Hello".
      const done = handle.refetch();
      await Promise.resolve();
      h.resolveMessages(initial);
      await done;
      await new Promise((r) => setTimeout(r, 1));

      // The in-flight delta survives: merge, not wholesale replace.
      expect(textOf(handle.messages()[0])).toBe('Hello, world');
      dispose();
    });
  });

  it('applies the reconciled snapshot verbatim when nothing is in flight', async () => {
    await createRoot(async (dispose) => {
      const initial: Message[] = [
        { id: 'm1', role: 'assistant', parts: [{ id: 'p1', type: 'text', text: 'Hi' }] },
      ];
      const h = harness();
      const [sessionId] = createSignal('s1');
      const handle = createLiveTranscript(h.client, sessionId);

      await Promise.resolve();
      h.resolveMessages(initial);
      await new Promise((r) => setTimeout(r, 1));

      // No in-flight mutation: the refetch snapshot wins, including a new
      // server-authoritative message the local feed had not seen yet.
      const snapshot: Message[] = [
        { id: 'm1', role: 'assistant', parts: [{ id: 'p1', type: 'text', text: 'Hi there' }] },
        { id: 'm2', role: 'user', parts: [{ id: 'p2', type: 'text', text: 'ok' }] },
      ];
      const done = handle.refetch();
      await Promise.resolve();
      h.resolveMessages(snapshot);
      await done;
      await new Promise((r) => setTimeout(r, 1));

      expect(handle.messages().map((m) => m.id)).toEqual(['m1', 'm2']);
      expect(textOf(handle.messages()[0])).toBe('Hi there');
      dispose();
    });
  });
});
