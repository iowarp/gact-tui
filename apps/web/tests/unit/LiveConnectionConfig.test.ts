import { describe, expect, it, vi } from 'vitest';
import type { PermissionRequest, UserQuestion } from '@clio/core';
import { LIVE_SSE_EVENT_TYPES } from '../../src/LiveConnectionConfig.js';
import { applyPendingInteractionEvent } from '../../src/LivePendingInteractions.js';

// The EventSource only delivers events whose names are registered in
// LIVE_SSE_EVENT_TYPES. Any event the reducers actually handle must be
// registered, otherwise the handler is dead code that never fires.
describe('LIVE_SSE_EVENT_TYPES registration', () => {
  const registered = new Set<string>(LIVE_SSE_EVENT_TYPES);

  // Probe the pending-interaction reducer for every user_question.* type it
  // claims to handle and assert the wire registers each one.
  const userQuestionTypes = [
    'user_question.created',
    'user_question.resumed',
    'user_question.answered',
    'user_question.cancelled',
    'user_question.expired',
  ];

  it.each(userQuestionTypes)('registers handled event type %s', (type) => {
    const hooks = {
      setPendingPermission: vi.fn<(p: PermissionRequest | null) => void>(),
      setPendingQuestion: vi.fn<(q: UserQuestion | null) => void>(),
    };
    // The reducer recognises this type (returns true => it is a real handler).
    expect(applyPendingInteractionEvent(type, {}, hooks)).toBe(true);
    // ...therefore the EventSource must register for it, or it never arrives.
    expect(registered.has(type)).toBe(true);
  });

  it('registers user_question.expired so pending questions clear on expiry', () => {
    expect(registered.has('user_question.expired')).toBe(true);
  });
});
