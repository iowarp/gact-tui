import type { Message } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { reduce, type ReduceHooks } from '../../src/LiveReducer.js';

// Minimal hook bag that records the session cost and messages so we can assert
// on cost accounting. cost.updated is the single source of truth for the
// session total (CostUpdatedPayload.cost_usd is an absolute number); per-message
// cost lives only on the message itself.
function makeHooks() {
  let cost = 0;
  let messages: Message[] = [];
  const apply = <T,>(cur: T, next: T | ((prev: T) => T)): T =>
    typeof next === 'function' ? (next as (prev: T) => T)(cur) : next;
  const hooks: ReduceHooks = {
    setMessages: (next) => {
      messages = apply(messages, next);
    },
    setPendingPermission: () => {},
    setLastCompletion: () => {},
    setCostUsd: (next) => {
      cost = apply(cost, next);
    },
    setRunningTools: () => {},
    setPendingQuestion: () => {},
  };
  return {
    hooks,
    get cost() {
      return cost;
    },
    get messages() {
      return messages;
    },
  };
}

describe('live cost accounting', () => {
  it('treats cost.updated as the absolute session total, not message.completed sums', () => {
    const h = makeHooks();
    // Seed a message so message.completed has something to annotate.
    h.hooks.setMessages([{ id: 'm1', role: 'assistant', parts: [] } as unknown as Message]);

    // Backend pushes a per-message cost on completion...
    reduce(
      { type: 'message.completed', payload: { message_id: 'm1', cost_usd: 0.12 } },
      h.hooks,
    );
    // ...then the authoritative absolute session total.
    reduce({ type: 'cost.updated', payload: { session_id: 's1', cost_usd: 0.12 } }, h.hooks);

    // The session cost must equal the absolute total (0.12), NOT 0.24 (0.12
    // accumulated by message.completed + 0.12 from cost.updated).
    expect(h.cost).toBeCloseTo(0.12, 10);
    // The per-message cost still rides on the message itself.
    expect(h.messages[0]?.cost_usd).toBeCloseTo(0.12, 10);
  });

  it('message.completed alone does not move the session cost total', () => {
    const h = makeHooks();
    h.hooks.setMessages([{ id: 'm1', role: 'assistant', parts: [] } as unknown as Message]);

    reduce(
      { type: 'message.completed', payload: { message_id: 'm1', cost_usd: 0.5 } },
      h.hooks,
    );

    // No cost.updated yet => session total stays at its initial value.
    expect(h.cost).toBe(0);
  });
});
