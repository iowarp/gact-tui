import type { Message, PermissionRequest, SemanticEventPayload, UserQuestion } from '@clio/core';
import { describe, expect, it } from 'vitest';
import type {
  ExecutionTranscriptEvent,
  MessageCompletion,
  NormalizedTranscriptState,
  RunningTool,
} from '../../src/live.js';
import { emptyNormalizedTranscriptState } from '../../src/NormalizedTranscriptEvents.js';
import {
  clearInactiveLiveTranscriptState,
  clearLiveTranscriptSessionFeeds,
  type LiveTranscriptInactiveSetters,
} from '../../src/LiveTranscriptModel.js';
import type { LiveConnectionStatus } from '../../src/LiveReconnect.js';

function createState() {
  let messages: Message[] = [{ id: 'm1', role: 'assistant', parts: [] }];
  let messagesLoading = true;
  let permission: PermissionRequest | null = { id: 'perm' } as PermissionRequest;
  let status: LiveConnectionStatus = 'open';
  let reconnectInSec = 5;
  let completion: MessageCompletion | null = {
    message_id: 'm1',
    stop_reason: 'end_turn',
  };
  let cost = 1.23;
  let tools: RunningTool[] = [{ callId: 'tool-1' } as RunningTool];
  let question: UserQuestion | null = { id: 'q1' } as UserQuestion;
  let semantic: SemanticEventPayload[] = [{ event_id: 'ev1', event_type: 'turn.started' }];
  let execution: ExecutionTranscriptEvent[] = [
    { sequence: 1, type: 'message.part.delta', payload: {} },
  ];
  let normalized: NormalizedTranscriptState = {
    ...emptyNormalizedTranscriptState(),
    rows: [{ kind: 'text', id: 'n1', depth: 0, agent: 'main', text: 'hello' }],
    activityKey: '1:1:1',
  };

  const setters: LiveTranscriptInactiveSetters = {
    setMessages: (next) => {
      messages = next as Message[];
      return messages;
    },
    setMessagesLoading: (next) => {
      messagesLoading = next as boolean;
      return messagesLoading;
    },
    setPendingPermission: (next) => {
      permission = next as PermissionRequest | null;
      return permission;
    },
    setStatus: (next) => {
      status = next as LiveConnectionStatus;
      return status;
    },
    setReconnectInSec: (next) => {
      reconnectInSec = next as number;
      return reconnectInSec;
    },
    setLastCompletion: (next) => {
      completion = next as MessageCompletion | null;
      return completion;
    },
    setCostUsd: (next) => {
      cost = next as number;
      return cost;
    },
    setRunningTools: (next) => {
      tools = next as RunningTool[];
      return tools;
    },
    setPendingQuestion: (next) => {
      question = next as UserQuestion | null;
      return question;
    },
    setSemanticEvents: (next) => {
      semantic = next as SemanticEventPayload[];
      return semantic;
    },
    setExecutionEvents: (next) => {
      execution = next as ExecutionTranscriptEvent[];
      return execution;
    },
    setNormalizedTranscript: (next) => {
      normalized = next as NormalizedTranscriptState;
      return normalized;
    },
  };

  return {
    setters,
    get state() {
      return {
        messages,
        messagesLoading,
        permission,
        status,
        reconnectInSec,
        completion,
        cost,
        tools,
        question,
        semantic,
        execution,
        normalized,
      };
    },
  };
}

describe('LiveTranscriptModel', () => {
  it('clears per-session semantic and execution feeds on session switch', () => {
    const harness = createState();

    clearLiveTranscriptSessionFeeds(harness.setters);

    expect(harness.state.semantic).toEqual([]);
    expect(harness.state.execution).toEqual([]);
    expect(harness.state.normalized.rows).toEqual([]);
    expect(harness.state.messages).toEqual([{ id: 'm1', role: 'assistant', parts: [] }]);
    expect(harness.state.status).toBe('open');
  });

  it('clears all inactive-session transcript state', () => {
    const harness = createState();

    clearInactiveLiveTranscriptState(harness.setters);

    expect(harness.state).toEqual({
      messages: [],
      messagesLoading: false,
      permission: null,
      status: 'closed',
      reconnectInSec: 0,
      completion: null,
      cost: 0,
      tools: [],
      question: null,
      semantic: [],
      execution: [],
      normalized: emptyNormalizedTranscriptState(),
    });
  });
});
