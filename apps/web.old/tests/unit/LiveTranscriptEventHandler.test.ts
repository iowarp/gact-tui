import type { Message, PermissionRequest, SemanticEventPayload, UserQuestion } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionTranscriptEvent, MessageCompletion, RunningTool } from '../../src/live.js';
import {
  createLiveTranscriptEventHandler,
  parseLiveEventData,
} from '../../src/LiveTranscriptEventHandler.js';

function makeHandler() {
  let messages: Message[] = [];
  let permission: PermissionRequest | null = null;
  let completion: MessageCompletion | null = null;
  let cost = 0;
  let tools: RunningTool[] = [];
  let question: UserQuestion | null = null;
  let semantic: SemanticEventPayload[] = [];
  let execution: ExecutionTranscriptEvent[] = [];
  const track = vi.fn();
  const reconcile = vi.fn();
  const apply = <T,>(cur: T, next: T | ((prev: T) => T)): T =>
    typeof next === 'function' ? (next as (prev: T) => T)(cur) : next;
  const handler = createLiveTranscriptEventHandler({
    sessionId: 's1',
    trackStreamEvent: track,
    scheduleReconcile: reconcile,
    reduceHooks: {
      setMessages: (next) => {
        messages = apply(messages, next);
      },
      setPendingPermission: (next) => {
        permission = next;
      },
      setLastCompletion: (next) => {
        completion = next;
      },
      setCostUsd: (next) => {
        cost = apply(cost, next);
      },
      setRunningTools: (next) => {
        tools = apply(tools, next);
      },
      setPendingQuestion: (next) => {
        question = next;
      },
      setSemanticEvents: (next) => {
        semantic = apply(semantic, next);
      },
      setExecutionEvents: (next) => {
        execution = apply(execution, next);
      },
      semanticFeedCap: 10,
    },
  });
  return {
    handler,
    track,
    reconcile,
    get state() {
      return { messages, permission, completion, cost, tools, question, semantic, execution };
    },
  };
}

describe('LiveTranscriptEventHandler', () => {
  it('parses live event JSON and ignores malformed data', () => {
    expect(parseLiveEventData('{"type":"message.created","payload":{}}')).toEqual({
      type: 'message.created',
      payload: {},
    });
    expect(parseLiveEventData('{bad json')).toBeNull();
  });

  it('tracks and reduces valid events', () => {
    const h = makeHandler();

    h.handler(
      JSON.stringify({
        type: 'message.created',
        payload: { id: 'a1', role: 'assistant', parts: [] },
      }),
    );

    expect(h.track).toHaveBeenCalledWith({
      type: 'message.created',
      payload: { id: 'a1', role: 'assistant', parts: [] },
    });
    expect(h.state.messages).toEqual([{ id: 'a1', role: 'assistant', parts: [] }]);
  });

  it('schedules reconciliation for active-session terminal events only', () => {
    const h = makeHandler();

    h.handler(JSON.stringify({ type: 'message.completed', payload: { session_id: 's1' } }));
    h.handler(JSON.stringify({ type: 'message.completed', payload: { session_id: 'other' } }));

    expect(h.reconcile).toHaveBeenCalledOnce();
  });

  it('does nothing for malformed event data', () => {
    const h = makeHandler();

    h.handler('{bad json');

    expect(h.track).not.toHaveBeenCalled();
    expect(h.reconcile).not.toHaveBeenCalled();
    expect(h.state.messages).toEqual([]);
  });
});
