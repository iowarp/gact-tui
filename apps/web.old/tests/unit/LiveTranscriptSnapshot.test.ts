import type { Message, PermissionRequest, UserQuestion } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  clearLiveTranscriptSnapshot,
  mergeLiveTranscriptSnapshot,
  replaceLiveTranscriptSnapshot,
  type LiveTranscriptSnapshotSetters,
} from '../../src/LiveTranscriptSnapshot.js';

function createSnapshotState() {
  let messages: Message[] = [{ id: 'existing-message', role: 'assistant', parts: [] }];
  let permission: PermissionRequest | null = { id: 'existing-permission' } as PermissionRequest;
  let question: UserQuestion | null = { id: 'existing-question' } as UserQuestion;

  const setters: LiveTranscriptSnapshotSetters = {
    setMessages: (next) => {
      messages = next;
    },
    setPendingPermission: (next) => {
      permission = next;
    },
    setPendingQuestion: (next) => {
      question = next;
    },
  };

  return {
    setters,
    get state() {
      return { messages, permission, question };
    },
  };
}

describe('LiveTranscriptSnapshot', () => {
  it('replaces absent snapshot fields with empty initial state', () => {
    const harness = createSnapshotState();

    replaceLiveTranscriptSnapshot({}, harness.setters);

    expect(harness.state).toEqual({
      messages: [],
      permission: null,
      question: null,
    });
  });

  it('clears transcript snapshot state on initial load failure', () => {
    const harness = createSnapshotState();

    clearLiveTranscriptSnapshot(harness.setters);

    expect(harness.state).toEqual({
      messages: [],
      permission: null,
      question: null,
    });
  });

  it('merges only fields that were successfully fetched during refetch', () => {
    const harness = createSnapshotState();
    const nextMessages: Message[] = [{ id: 'next-message', role: 'user', parts: [] }];

    mergeLiveTranscriptSnapshot({ messages: nextMessages }, harness.setters);

    expect(harness.state).toEqual({
      messages: nextMessages,
      permission: { id: 'existing-permission' },
      question: { id: 'existing-question' },
    });
  });

  it('merges explicit null pending states during refetch', () => {
    const harness = createSnapshotState();

    mergeLiveTranscriptSnapshot({ pendingPermission: null, pendingQuestion: null }, harness.setters);

    expect(harness.state).toEqual({
      messages: [{ id: 'existing-message', role: 'assistant', parts: [] }],
      permission: null,
      question: null,
    });
  });
});
