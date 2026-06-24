import type { PermissionRequest, UserQuestion } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  applyPendingInteractionEvent,
  permissionFromPayload,
} from '../../src/LivePendingInteractions.js';

function makeHooks() {
  let pendingPermission: PermissionRequest | null = null;
  let pendingQuestion: UserQuestion | null = null;
  return {
    hooks: {
      setPendingPermission: (next: PermissionRequest | null) => {
        pendingPermission = next;
      },
      setPendingQuestion: (next: UserQuestion | null) => {
        pendingQuestion = next;
      },
    },
    get pendingPermission() {
      return pendingPermission;
    },
    get pendingQuestion() {
      return pendingQuestion;
    },
  };
}

describe('LivePendingInteractions', () => {
  it('normalizes flat permission payloads', () => {
    expect(
      permissionFromPayload({
        id: 'perm_1',
        session_id: 's1',
        tool_call: { tool_name: 'shell_bash', input: { cmd: 'ls' } },
        risk: 'medium',
        reason: 'inspect files',
        occurred_at: '2026-06-20T12:00:00Z',
      }),
    ).toEqual({
      id: 'perm_1',
      session_id: 's1',
      tool_name: 'shell_bash',
      tool_call: { input: { cmd: 'ls' } },
      risk: 'medium',
      reason: 'inspect files',
      created_at: '2026-06-20T12:00:00Z',
    });
  });

  it('sets and clears pending permissions', () => {
    const h = makeHooks();

    expect(
      applyPendingInteractionEvent(
        'permission.requested',
        { id: 'perm_1', session_id: 's1', tool_name: 'tool' },
        h.hooks,
      ),
    ).toBe(true);
    expect(h.pendingPermission?.id).toBe('perm_1');

    applyPendingInteractionEvent('permission.resolved', {}, h.hooks);
    expect(h.pendingPermission).toBeNull();
  });

  it('sets only pending user questions and clears resolved questions', () => {
    const h = makeHooks();
    const pending = {
      id: 'q1',
      session_id: 's1',
      prompt: 'Choose one',
      status: 'pending',
    } as UserQuestion;
    const answered = { ...pending, id: 'q2', status: 'answered' } as UserQuestion;

    applyPendingInteractionEvent('user_question.created', { question: answered }, h.hooks);
    expect(h.pendingQuestion).toBeNull();

    applyPendingInteractionEvent('user_question.resumed', { question: pending }, h.hooks);
    expect(h.pendingQuestion?.id).toBe('q1');

    applyPendingInteractionEvent('user_question.answered', {}, h.hooks);
    expect(h.pendingQuestion).toBeNull();
  });

  it('clears the pending question when it expires or is cancelled', () => {
    for (const resolution of ['user_question.expired', 'user_question.cancelled'] as const) {
      const h = makeHooks();
      const pending = {
        id: 'q-exp',
        session_id: 's1',
        prompt: 'Choose one',
        status: 'pending',
      } as UserQuestion;
      applyPendingInteractionEvent('user_question.created', { question: pending }, h.hooks);
      expect(h.pendingQuestion?.id).toBe('q-exp');
      expect(applyPendingInteractionEvent(resolution, {}, h.hooks)).toBe(true);
      expect(h.pendingQuestion).toBeNull();
    }
  });

  it('returns false for unrelated events', () => {
    expect(applyPendingInteractionEvent('message.completed', {}, makeHooks().hooks)).toBe(false);
  });
});
