/**
 * Reduces the message-stream SSE events (`message.created`, content `*.delta`,
 * part/tool/cost lifecycle) into the transcript message feed and per-turn signals.
 */
import {
  applyTextAppend,
  appendPart,
  upsertMessage,
  type Message,
} from '@clio/core';
import {
  appendExecutionTranscriptEvent,
  type ExecutionTranscriptEvent,
} from './LiveExecutionEvents.js';
import {
  applyCostUpdated,
  applyMessageCompleted,
  applyMessageDeleted,
  applyMessageError,
  applyMessagePartCompleted,
  type MessageCompletion,
} from './LiveMessageLifecycleEvents.js';
import type { RunningTool } from './LiveRunningTools.js';

export type { MessageCompletion } from './LiveMessageLifecycleEvents.js';

export interface MessageEventHooks {
  setMessages: (m: Message[] | ((p: Message[]) => Message[])) => void;
  setLastCompletion: (c: MessageCompletion | null) => void;
  setCostUsd: (n: number | ((p: number) => number)) => void;
  setRunningTools: (n: RunningTool[] | ((p: RunningTool[]) => RunningTool[])) => void;
  setExecutionEvents?: (
    n: ExecutionTranscriptEvent[] | ((p: ExecutionTranscriptEvent[]) => ExecutionTranscriptEvent[]),
  ) => void;
}

export function applyLiveMessageEvent(
  type: string | undefined,
  payload: Record<string, unknown>,
  hooks: MessageEventHooks,
): boolean {
  switch (type) {
    case 'message.created':
      applyMessageCreated(payload, hooks);
      return true;
    case 'message.part.added':
      applyMessagePartAdded(type, payload, hooks);
      return true;
    case 'message.part.delta':
      applyMessagePartDelta(type, payload, hooks);
      return true;
    case 'message.completed':
      applyMessageCompleted(payload, hooks);
      return true;
    case 'message.error':
      applyMessageError(payload, hooks);
      return true;
    case 'cost.updated':
      applyCostUpdated(payload, hooks);
      return true;
    case 'message.part.completed':
      applyMessagePartCompleted(payload, hooks);
      return true;
    case 'message.deleted':
      applyMessageDeleted(payload, hooks);
      return true;
    default:
      return false;
  }
}

function applyMessageCreated(payload: Record<string, unknown>, hooks: MessageEventHooks) {
  const nested = payload['message'] as Message | undefined;
  const flat = (payload['id'] && payload['role'] ? payload : undefined) as Message | undefined;
  const msg = nested ?? flat;
  if (msg) hooks.setMessages((prev) => upsertMessage(prev, msg));
}

function applyMessagePartAdded(
  type: string,
  payload: Record<string, unknown>,
  hooks: MessageEventHooks,
) {
  const messageId = payload.message_id as string;
  const part = payload.part as Message['parts'][number];
  appendExecutionTranscriptEvent(type, payload, hooks, part);
  if (messageId && part) {
    hooks.setMessages((prev) => appendPart(prev, messageId, part));
  }
}

function applyMessagePartDelta(
  type: string,
  payload: Record<string, unknown>,
  hooks: MessageEventHooks,
) {
  const messageId = payload.message_id as string;
  const partId = payload.part_id as string;
  const delta = (payload.delta as { text_append?: string }) ?? {};
  appendExecutionTranscriptEvent(type, payload, hooks);
  if (messageId && partId && delta.text_append) {
    hooks.setMessages((prev) => applyTextAppend(prev, messageId, partId, delta.text_append!));
  }
}
