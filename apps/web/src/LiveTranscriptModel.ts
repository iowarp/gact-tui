/**
 * Reset helpers for transcript signals: clears the per-session feeds on switch
 * ({@link clearLiveTranscriptSessionFeeds}) and the full inactive state when no
 * session is selected ({@link clearInactiveLiveTranscriptState}).
 */
import type { Setter } from 'solid-js';
import type { Message, PermissionRequest, SemanticEventPayload, UserQuestion } from '@clio/core';
import type {
  ExecutionTranscriptEvent,
  MessageCompletion,
  RunningTool,
} from './LiveReducer.js';
import type { LiveConnectionStatus } from './LiveReconnect.js';
import {
  emptyNormalizedTranscriptState,
  type NormalizedTranscriptState,
} from './NormalizedTranscriptEvents.js';

export interface LiveTranscriptFeedSetters {
  setSemanticEvents: Setter<SemanticEventPayload[]>;
  setExecutionEvents: Setter<ExecutionTranscriptEvent[]>;
  setNormalizedTranscript: Setter<NormalizedTranscriptState>;
}

export interface LiveTranscriptInactiveSetters extends LiveTranscriptFeedSetters {
  setMessages: Setter<Message[]>;
  setMessagesLoading: Setter<boolean>;
  setPendingPermission: Setter<PermissionRequest | null>;
  setStatus: Setter<LiveConnectionStatus>;
  setReconnectInSec: Setter<number>;
  setLastCompletion: Setter<MessageCompletion | null>;
  setCostUsd: Setter<number>;
  setRunningTools: Setter<RunningTool[]>;
  setPendingQuestion: Setter<UserQuestion | null>;
}

export function clearLiveTranscriptSessionFeeds(setters: LiveTranscriptFeedSetters) {
  setters.setSemanticEvents([]);
  setters.setExecutionEvents([]);
  setters.setNormalizedTranscript(emptyNormalizedTranscriptState());
}

export function clearInactiveLiveTranscriptState(setters: LiveTranscriptInactiveSetters) {
  clearLiveTranscriptSessionFeeds(setters);
  setters.setMessages([]);
  setters.setMessagesLoading(false);
  setters.setPendingPermission(null);
  setters.setStatus('closed');
  setters.setReconnectInSec(0);
  setters.setLastCompletion(null);
  setters.setCostUsd(0);
  setters.setRunningTools([]);
  setters.setPendingQuestion(null);
}
