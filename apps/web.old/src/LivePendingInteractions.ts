/**
 * Reduces permission-request and ask-user-question SSE events into the two
 * pending-interaction signals. Exports {@link applyPendingInteractionEvent} and
 * the {@link permissionFromPayload} payload normaliser.
 */
import type { PermissionRequest, UserQuestion } from '@clio/core';

export interface PendingInteractionHooks {
  setPendingPermission: (p: PermissionRequest | null) => void;
  setPendingQuestion: (q: UserQuestion | null) => void;
}

export function applyPendingInteractionEvent(
  type: string | undefined,
  payload: Record<string, unknown>,
  hooks: PendingInteractionHooks,
): boolean {
  switch (type) {
    case 'permission.requested': {
      const req = permissionFromPayload(payload);
      if (req) hooks.setPendingPermission(req);
      return true;
    }
    case 'permission.resolved':
      hooks.setPendingPermission(null);
      return true;
    case 'user_question.created':
    case 'user_question.resumed': {
      const question = userQuestionFromPayload(payload);
      if (question && question.status === 'pending') hooks.setPendingQuestion(question);
      return true;
    }
    case 'user_question.answered':
    case 'user_question.cancelled':
    case 'user_question.expired':
      hooks.setPendingQuestion(null);
      return true;
    default:
      return false;
  }
}

export function permissionFromPayload(payload: Record<string, unknown>): PermissionRequest | null {
  const nested = payload['permission'] as PermissionRequest | undefined;
  if (nested) return nested;
  if (typeof payload['id'] !== 'string') return null;
  const toolCall = payload['tool_call'] as
    | { tool_name?: string; input?: Record<string, unknown> }
    | undefined;
  return {
    id: payload['id'],
    session_id: (payload['session_id'] as string) ?? '',
    tool_name: toolCall?.tool_name ?? (payload['tool_name'] as string | undefined) ?? 'tool',
    tool_call: toolCall?.input ? { input: toolCall.input } : undefined,
    risk: payload['risk'] as PermissionRequest['risk'],
    reason: payload['reason'] as string | undefined,
    created_at:
      (payload['created_at'] as string | undefined) ??
      (payload['occurred_at'] as string | undefined) ??
      '',
  };
}

function userQuestionFromPayload(payload: Record<string, unknown>): UserQuestion | null {
  const nested = payload['question'] as UserQuestion | undefined;
  if (nested) return nested;
  if (typeof payload['id'] === 'string' && typeof payload['prompt'] === 'string') {
    return payload as unknown as UserQuestion;
  }
  return null;
}
