import type { Message } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  applyLiveMessageEvent,
  type MessageCompletion,
} from '../../src/LiveMessageEvents.js';
import { applyLiveToolEvent } from '../../src/LiveToolEvents.js';
import type { ExecutionTranscriptEvent, RunningTool } from '../../src/live.js';

function makeHooks(initialMessages: Message[] = []) {
  let messages = initialMessages;
  let lastCompletion: MessageCompletion | null = null;
  let cost = 0;
  let runningTools: RunningTool[] = [{ callId: 'call_1', toolName: 'tool', startedAt: 1 }];
  let executionEvents: ExecutionTranscriptEvent[] = [];
  const apply = <T,>(cur: T, next: T | ((prev: T) => T)): T =>
    typeof next === 'function' ? (next as (prev: T) => T)(cur) : next;
  return {
    hooks: {
      setMessages: (next: Message[] | ((prev: Message[]) => Message[])) => {
        messages = apply(messages, next);
      },
      setLastCompletion: (next: MessageCompletion | null) => {
        lastCompletion = next;
      },
      setCostUsd: (next: number | ((prev: number) => number)) => {
        cost = apply(cost, next);
      },
      setRunningTools: (next: RunningTool[] | ((prev: RunningTool[]) => RunningTool[])) => {
        runningTools = apply(runningTools, next);
      },
      setExecutionEvents: (
        next: ExecutionTranscriptEvent[] | ((prev: ExecutionTranscriptEvent[]) => ExecutionTranscriptEvent[]),
      ) => {
        executionEvents = apply(executionEvents, next);
      },
    },
    get messages() {
      return messages;
    },
    get lastCompletion() {
      return lastCompletion;
    },
    get cost() {
      return cost;
    },
    get runningTools() {
      return runningTools;
    },
    get executionEvents() {
      return executionEvents;
    },
  };
}

describe('LiveMessageEvents', () => {
  it('upserts created messages from nested and flat payloads', () => {
    const h = makeHooks();
    applyLiveMessageEvent(
      'message.created',
      { message: { id: 'a1', role: 'assistant', parts: [] } },
      h.hooks,
    );
    applyLiveMessageEvent(
      'message.created',
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
      h.hooks,
    );

    expect(h.messages).toEqual([{ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] }]);
  });

  it('applies parts and text deltas while emitting execution events', () => {
    const h = makeHooks([{ id: 'a1', role: 'assistant', parts: [] }]);
    applyLiveMessageEvent(
      'message.part.added',
      {
        turn_id: 'u1',
        message_id: 'a1',
        stream_source: 'batch',
        part: { id: 'p1', type: 'text', text: 'hello' },
      },
      h.hooks,
    );
    applyLiveMessageEvent(
      'message.part.delta',
      {
        turn_id: 'u1',
        message_id: 'a1',
        part_id: 'p1',
        delta: { text_append: ' world' },
      },
      h.hooks,
    );

    expect(h.messages[0]?.parts).toEqual([{ id: 'p1', type: 'text', text: 'hello world' }]);
    expect(h.executionEvents.map((event) => event.type)).toEqual([
      'message.part.added',
      'message.part.delta',
    ]);
  });

  it('patches completion metadata onto the message without touching the session cost total or in-flight tools', () => {
    const h = makeHooks([{ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] }]);
    h.hooks.setCostUsd(2);

    applyLiveMessageEvent(
      'message.completed',
      {
        message_id: 'a1',
        stop_reason: 'end_turn',
        tokens: { input: 10, output: 5 },
        cost_usd: 0.25,
      },
      h.hooks,
    );

    expect(h.lastCompletion).toMatchObject({ message_id: 'a1', stop_reason: 'end_turn' });
    // The session total is owned solely by cost.updated (absolute). message.completed
    // must NOT accumulate into it, or the displayed session cost double-counts.
    expect(h.cost).toBe(2);
    // Regression: message.completed must NOT blanket-clear running tools. A tool whose
    // tool.call.completed has not yet arrived is still genuinely in-flight; clearing it
    // here would drop it from the running-tools chip. Tool lifecycle is owned by
    // tool.call.completed alone (keyed by callId).
    expect(h.runningTools).toEqual([{ callId: 'call_1', toolName: 'tool', startedAt: 1 }]);
    expect(h.messages[0]).toMatchObject({
      stop_reason: 'end_turn',
      tokens: { input: 10, output: 5 },
      // The per-message cost still rides on the message itself.
      cost_usd: 0.25,
    });
  });

  it('clears a still-in-flight tool only once its own tool.call.completed arrives, even after message.completed', () => {
    const h = makeHooks([{ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] }]);

    // message.completed races ahead of the tool's terminal event.
    applyLiveMessageEvent('message.completed', { message_id: 'a1', stop_reason: 'end_turn' }, h.hooks);
    // Tool is still running.
    expect(h.runningTools).toEqual([{ callId: 'call_1', toolName: 'tool', startedAt: 1 }]);

    // The tool's own terminal event is the single source that clears it.
    applyLiveToolEvent('tool.call.completed', { call_id: 'call_1' }, h.hooks);
    expect(h.runningTools).toEqual([]);
  });

  it('applies message errors, final text, deletions, and absolute cost updates', () => {
    const h = makeHooks([
      { id: 'a1', role: 'assistant', parts: [{ id: 'p1', type: 'text', text: 'draft' }] },
    ]);

    applyLiveMessageEvent(
      'message.error',
      { message_id: 'a1', error: { error: 'runtime_error', message: 'boom' } },
      h.hooks,
    );
    applyLiveMessageEvent(
      'message.part.completed',
      { message_id: 'a1', part_id: 'p1', final_text: 'final' },
      h.hooks,
    );
    applyLiveMessageEvent('cost.updated', { cost_usd: 7 }, h.hooks);

    expect(h.messages[0]).toMatchObject({
      stop_reason: 'error',
      error_info: { error: 'runtime_error', message: 'boom' },
      parts: [{ id: 'p1', type: 'text', text: 'final' }],
    });
    expect(h.cost).toBe(7);

    applyLiveMessageEvent('message.deleted', { message_id: 'a1' }, h.hooks);
    expect(h.messages).toEqual([]);
  });

  it('returns false for non-message events', () => {
    expect(applyLiveMessageEvent('tool.call.started', {}, makeHooks().hooks)).toBe(false);
  });
});
