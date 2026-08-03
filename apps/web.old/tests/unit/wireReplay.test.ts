/**
 * Clean-stream end-to-end replay.
 *
 * Feeds the real captured wire
 * (`tui/internal/ui/testdata/earthscope-la.wire.sse`) through the SAME path the
 * live web app uses — the top-level `reduce()` dispatcher — and asserts the
 * transcript message list is exactly the two REAL messages (1 user + 1
 * assistant), with NO synthetic/phantom assistant messages. Messages are built
 * purely from `message.*` events; the retired `turn.*` normalized stream is no
 * longer reduced (it falls through to onUnhandled and is ignored).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Message } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { reduce, type ExecutionTranscriptEvent } from '../../src/LiveReducer.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WIRE = resolve(
  HERE,
  '../../../../tui/internal/ui/testdata/earthscope-la.wire.sse',
);

interface WireEvent {
  type?: string;
  payload?: Record<string, unknown>;
}

/** Parse an SSE capture into the decoded `data:` JSON payloads, in order. */
function parseWire(text: string): WireEvent[] {
  const events: WireEvent[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const json = line.slice('data:'.length).trim();
      if (!json) continue;
      events.push(JSON.parse(json) as WireEvent);
    }
  }
  return events;
}

/** Build a hook bag that records the two signals we assert on and no-ops the
 * rest, mirroring the real live transcript's `ReduceHooks` shape. */
function makeRecorder() {
  let messages: Message[] = [];
  let executionEvents: ExecutionTranscriptEvent[] = [];
  const apply = <T>(cur: T, next: T | ((p: T) => T)): T =>
    typeof next === 'function' ? (next as (p: T) => T)(cur) : next;
  const noop = () => {};
  const hooks = {
    setMessages: (n: Message[] | ((p: Message[]) => Message[])) => {
      messages = apply(messages, n);
    },
    setExecutionEvents: (
      n: ExecutionTranscriptEvent[] | ((p: ExecutionTranscriptEvent[]) => ExecutionTranscriptEvent[]),
    ) => {
      executionEvents = apply(executionEvents, n);
    },
    setLastCompletion: noop,
    setCostUsd: noop,
    setRunningTools: noop,
    setSessions: noop,
    setRenameToast: noop,
    setPendingPermission: noop,
    setPendingQuestion: noop,
    setSemanticEvents: noop,
    onNotification: noop,
    onUnhandled: noop,
  } as unknown as Parameters<typeof reduce>[1];
  return {
    hooks,
    get messages() {
      return messages;
    },
    get executionEvents() {
      return executionEvents;
    },
  };
}

describe('clean-stream wire replay', () => {
  const wire = parseWire(readFileSync(WIRE, 'utf8'));
  const rec = makeRecorder();
  for (const ev of wire) reduce({ type: ev.type, payload: ev.payload }, rec.hooks);

  it('produces exactly the two real messages — no phantom assistant turns', () => {
    expect(rec.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    // No synthetic message ids — both are the backend-issued msg_* ids.
    expect(rec.messages.every((m) => String(m.id ?? '').startsWith('msg_'))).toBe(true);
    // The user turn is the original prompt; the assistant turn carries parts.
    expect(rec.messages[0]?.parts?.[0]?.type).toBe('text');
    expect((rec.messages[1]?.parts?.length ?? 0)).toBeGreaterThan(0);
  });
});
