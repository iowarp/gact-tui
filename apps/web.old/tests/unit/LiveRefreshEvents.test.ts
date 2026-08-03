import type { Message, PermissionRequest, UserQuestion } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { applyLiveRefreshEvent } from '../../src/LiveRefreshEvents.js';
import type { MessageCompletion, RunningTool } from '../../src/live.js';
import type { BackendNotification } from '../../src/LiveNotifications.js';

function makeHooks() {
  let messages: Message[] = [{ id: 'a1', role: 'assistant', parts: [] }];
  let permission: PermissionRequest | null = { id: 'perm_1' } as PermissionRequest;
  let question: UserQuestion | null = { id: 'q1', status: 'pending' } as UserQuestion;
  let completion: MessageCompletion | null = { message_id: 'a1', stop_reason: 'end_turn' };
  let tools: RunningTool[] = [{ callId: 'call_1', toolName: 'shell', startedAt: 1 }];
  const notifications: BackendNotification[] = [];
  const frameChanged = vi.fn();
  const contextFilesChanged = vi.fn();
  const diffChanged = vi.fn();
  return {
    hooks: {
      setMessages: (next: Message[] | ((prev: Message[]) => Message[])) => {
        messages = typeof next === 'function' ? next(messages) : next;
      },
      setPendingPermission: (next: PermissionRequest | null) => {
        permission = next;
      },
      setPendingQuestion: (next: UserQuestion | null) => {
        question = next;
      },
      setLastCompletion: (next: MessageCompletion | null) => {
        completion = next;
      },
      setRunningTools: (next: RunningTool[] | ((prev: RunningTool[]) => RunningTool[])) => {
        tools = typeof next === 'function' ? next(tools) : next;
      },
      onNotification: (notification: BackendNotification) => {
        notifications.push(notification);
      },
      onFrameChanged: frameChanged,
      onContextFilesChanged: contextFilesChanged,
      onDiffChanged: diffChanged,
    },
    frameChanged,
    contextFilesChanged,
    diffChanged,
    notifications,
    get state() {
      return { messages, permission, question, completion, tools };
    },
  };
}

describe('LiveRefreshEvents', () => {
  it('fires frame and context-file refetch hooks', () => {
    const h = makeHooks();

    expect(applyLiveRefreshEvent('context.frame.completed', {}, h.hooks)).toBe(true);
    expect(applyLiveRefreshEvent('context.file.added', {}, h.hooks)).toBe(true);

    expect(h.frameChanged).toHaveBeenCalledOnce();
    expect(h.contextFilesChanged).toHaveBeenCalledOnce();
  });

  it('clears session-local live state when a session is cleared', () => {
    const h = makeHooks();

    applyLiveRefreshEvent('session.cleared', {}, h.hooks);

    expect(h.state).toEqual({
      messages: [],
      permission: null,
      question: null,
      completion: null,
      tools: [],
    });
  });

  it('fires diff refetch hooks and reports write failures', () => {
    const h = makeHooks();

    applyLiveRefreshEvent(
      'file.diff.write_failed',
      { path: 'src/app.ts', error: 'permission denied' },
      h.hooks,
    );

    expect(h.diffChanged).toHaveBeenCalledOnce();
    expect(h.notifications).toEqual([
      {
        level: 'error',
        title: 'Diff write failed',
        body: 'src/app.ts — permission denied',
      },
    ]);
  });

  it('returns false for unrelated events', () => {
    expect(applyLiveRefreshEvent('message.completed', {}, makeHooks().hooks)).toBe(false);
  });
});
