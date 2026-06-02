/**
 * GAP 1 + GAP 3 — SSE reducer (web/src/live.ts `reduce`).
 *
 * `reduce` is the pure event→signal sink that drives the live transcript.
 * Driving it directly (with stubbed setters) pins the wire contracts
 * without standing up a real EventSource:
 *   - GAP 1: a pre_message-hook block folds into `message.completed` with
 *     stop_reason "blocked" + error_info, targeting the USER message.
 *   - GAP 3: `semantic.event` frames land in the read-only semantic feed
 *     but never create transcript messages/parts.
 */
import { describe, expect, it } from 'vitest';
import { reduce, type ReduceHooks } from '../../src/live.js';
import type { Message, SemanticEventPayload } from '@clio/core';

/** A minimal mutable harness over the subset of hooks a test cares about.
 * Each setter accepts either a value or an updater, mirroring Solid's
 * Setter signature the real call site passes. */
function makeHooks(initialMessages: Message[] = []) {
  let messages = initialMessages;
  let semantic: SemanticEventPayload[] = [];
  let lastCompletion: unknown = null;
  let cost = 0;

  const apply = <T,>(cur: T, next: T | ((p: T) => T)): T =>
    typeof next === 'function' ? (next as (p: T) => T)(cur) : next;

  const hooks: ReduceHooks = {
    setMessages: (m) => {
      messages = apply(messages, m);
    },
    setPendingPermission: () => undefined,
    setLastCompletion: (c) => {
      lastCompletion = c;
    },
    setCostUsd: (n) => {
      cost = apply(cost, n);
    },
    setRunningTools: () => undefined,
    setPendingQuestion: () => undefined,
    setSemanticEvents: (n) => {
      semantic = apply(semantic, n);
    },
    semanticFeedCap: 500,
  };

  return {
    hooks,
    get messages() {
      return messages;
    },
    get semantic() {
      return semantic;
    },
    get lastCompletion() {
      return lastCompletion as { stop_reason?: string } | null;
    },
    get cost() {
      return cost;
    },
  };
}

const USER_MSG: Message = {
  id: 'usr_1',
  role: 'user',
  parts: [{ type: 'text', text: 'please BLOCKME' }],
};

describe('reduce: message.completed blocked turn (GAP 1)', () => {
  it('patches the USER message with stop_reason "blocked" + error_info', () => {
    const h = makeHooks([{ ...USER_MSG }]);
    reduce(
      {
        type: 'message.completed',
        payload: {
          message_id: 'usr_1',
          stop_reason: 'blocked',
          error_info: {
            error: 'permission_error',
            message: 'Message blocked by pre_message hook.',
            recoverable: true,
          },
        },
      },
      h.hooks,
    );
    const patched = h.messages.find((m) => m.id === 'usr_1')!;
    expect(patched.stop_reason).toBe('blocked');
    expect(patched.error_info).toEqual({
      error: 'permission_error',
      message: 'Message blocked by pre_message hook.',
      recoverable: true,
    });
    // No assistant message is fabricated — only the user message exists.
    expect(h.messages).toHaveLength(1);
    expect(h.messages[0]!.role).toBe('user');
  });

  it('still records the completion summary for the topbar', () => {
    const h = makeHooks([{ ...USER_MSG }]);
    reduce(
      {
        type: 'message.completed',
        payload: {
          message_id: 'usr_1',
          stop_reason: 'blocked',
          error_info: { error: 'permission_error', message: 'nope' },
        },
      },
      h.hooks,
    );
    expect(h.lastCompletion?.stop_reason).toBe('blocked');
  });

  it('a normal completion carries no error_info', () => {
    const h = makeHooks([
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
    ]);
    reduce(
      {
        type: 'message.completed',
        payload: {
          message_id: 'a1',
          stop_reason: 'end_turn',
          tokens: { input: 10, output: 5 },
        },
      },
      h.hooks,
    );
    const patched = h.messages.find((m) => m.id === 'a1')!;
    expect(patched.stop_reason).toBe('end_turn');
    expect(patched.error_info).toBeUndefined();
  });
});

describe('reduce: semantic.event feed (GAP 3)', () => {
  const sev = (
    id: string,
    over: Partial<SemanticEventPayload> = {},
  ): { type: string; payload: Record<string, unknown> } => ({
    type: 'semantic.event',
    payload: {
      schema_version: 'clio.semantic_event.v1',
      event_id: id,
      event_type: 'turn.started',
      turn_id: 'usr_1',
      status: 'started',
      occurred_at: '2026-06-02T10:00:00Z',
      ...over,
    },
  });

  it('appends semantic events to the feed without touching the transcript', () => {
    const h = makeHooks([{ ...USER_MSG }]);
    reduce(sev('ev_1'), h.hooks);
    reduce(sev('ev_2', { event_type: 'turn.completed', status: 'completed' }), h.hooks);
    expect(h.semantic.map((e) => e.event_id)).toEqual(['ev_1', 'ev_2']);
    // The transcript is untouched — semantic events are an observability
    // trace, not a message source.
    expect(h.messages).toHaveLength(1);
    expect(h.messages[0]!.role).toBe('user');
  });

  it('is idempotent on replay — duplicate event_ids are dropped', () => {
    const h = makeHooks();
    reduce(sev('ev_1'), h.hooks);
    reduce(sev('ev_1'), h.hooks);
    expect(h.semantic).toHaveLength(1);
  });

  it('ignores semantic frames without an event_id', () => {
    const h = makeHooks();
    reduce(
      { type: 'semantic.event', payload: { event_type: 'turn.started' } },
      h.hooks,
    );
    expect(h.semantic).toHaveLength(0);
  });
});
