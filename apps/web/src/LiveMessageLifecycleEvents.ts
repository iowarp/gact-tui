/**
 * Applies the terminal message events (completed, error, deleted, part-completed,
 * cost.updated) to the message feed and completion/cost signals.
 */
import {
  applyPartCompleted,
  type ErrorInfo,
  type Message,
} from '@clio/core';
import type { MessageEventHooks } from './LiveMessageEvents.js';

export interface MessageCompletion {
  message_id: string;
  stop_reason: string;
  tokens?: { input?: number; output?: number; total?: number };
  cost_usd?: number;
}

export function applyMessageCompleted(
  payload: Record<string, unknown>,
  hooks: MessageEventHooks,
) {
  const completion: MessageCompletion = {
    message_id: payload.message_id as string,
    stop_reason: (payload.stop_reason as string) ?? 'unknown',
    tokens: payload.tokens as MessageCompletion['tokens'],
    cost_usd: payload.cost_usd as number | undefined,
  };
  const errorInfo = payload.error_info as ErrorInfo | undefined;
  hooks.setLastCompletion(completion);
  // Session-level cost is owned solely by `cost.updated` (an absolute total per
  // CostUpdatedPayload). message.completed only records the per-message cost on
  // the message itself — accumulating it here double-counted the session total.
  hooks.setMessages((prev) =>
    prev.map((m) =>
      m.id === completion.message_id
        ? {
            ...m,
            stop_reason: completion.stop_reason,
            tokens: completion.tokens ?? m.tokens,
            cost_usd: completion.cost_usd ?? m.cost_usd,
            ...(errorInfo ? { error_info: errorInfo } : {}),
          }
        : m,
    ),
  );
  // Do NOT blanket-clear running tools here. Tool lifecycle is owned solely by
  // `tool.call.completed` (LiveToolEvents → applyRunningToolCompleted), keyed by
  // callId. A `message.completed` can arrive before a still-in-flight tool's
  // `tool.call.completed`, so wiping all running tools here would drop genuinely
  // active tools and mismatch the running-tools chip. Mirrors the TUI, whose
  // applyMessageCompleted never touches running tools. A full session refresh
  // (LiveRefreshEvents) is the only path that resets the whole set.
}

export function applyMessageError(payload: Record<string, unknown>, hooks: MessageEventHooks) {
  const messageId = payload.message_id as string;
  const error = payload.error as Message['error_info'] | undefined;
  if (messageId && error) {
    hooks.setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, error_info: error, stop_reason: 'error' } : m,
      ),
    );
  }
}

export function applyCostUpdated(payload: Record<string, unknown>, hooks: MessageEventHooks) {
  const cost = payload.cost_usd as number | undefined;
  if (typeof cost === 'number') hooks.setCostUsd(cost);
}

export function applyMessagePartCompleted(
  payload: Record<string, unknown>,
  hooks: MessageEventHooks,
) {
  const messageId = payload.message_id as string | undefined;
  const partId = payload.part_id as string | undefined;
  const finalText = payload.final_text as string | undefined;
  if (messageId && partId && typeof finalText === 'string') {
    hooks.setMessages((prev) => applyPartCompleted(prev, messageId, partId, finalText));
  }
}

export function applyMessageDeleted(payload: Record<string, unknown>, hooks: MessageEventHooks) {
  const messageId = payload.message_id as string | undefined;
  if (messageId) {
    hooks.setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }
}
