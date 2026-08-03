/**
 * Reduces SSE events that invalidate cached views (context frames/files, diffs,
 * session.cleared) into refresh callbacks and feed resets. Exports
 * {@link applyLiveRefreshEvent} and the {@link RefreshEventHooks} contract.
 */
import type { Message, PermissionRequest, UserQuestion } from '@clio/core';
import type { BackendNotification } from './LiveNotifications.js';
import type { MessageCompletion } from './LiveMessageEvents.js';
import type { RunningTool } from './LiveRunningTools.js';

export interface RefreshEventHooks {
  setMessages: (m: Message[] | ((p: Message[]) => Message[])) => void;
  setPendingPermission: (p: PermissionRequest | null) => void;
  setLastCompletion: (c: MessageCompletion | null) => void;
  setRunningTools: (n: RunningTool[] | ((p: RunningTool[]) => RunningTool[])) => void;
  setPendingQuestion: (q: UserQuestion | null) => void;
  onNotification?: (n: BackendNotification) => void;
  onFrameChanged?: () => void;
  onContextFilesChanged?: () => void;
  onDiffChanged?: () => void;
}

export function applyLiveRefreshEvent(
  type: string | undefined,
  payload: Record<string, unknown>,
  hooks: RefreshEventHooks,
): boolean {
  switch (type) {
    case 'context.frame.created':
    case 'context.frame.completed':
      hooks.onFrameChanged?.();
      return true;
    case 'session.cleared':
      hooks.setMessages(() => []);
      hooks.setPendingPermission(null);
      hooks.setRunningTools(() => []);
      hooks.setPendingQuestion(null);
      hooks.setLastCompletion(null);
      return true;
    case 'context.file.added':
    case 'context.file.removed':
      hooks.onContextFilesChanged?.();
      return true;
    case 'file.diff.applied':
    case 'file.diff.rejected':
    case 'file.diff.write_failed':
      hooks.onDiffChanged?.();
      if (type === 'file.diff.write_failed') {
        hooks.onNotification?.(diffWriteFailedNotification(payload));
      }
      return true;
    default:
      return false;
  }
}

function diffWriteFailedNotification(payload: Record<string, unknown>): BackendNotification {
  const path = (payload.path as string) ?? 'unknown path';
  const reason = (payload.error as string) ?? (payload.message as string) ?? 'see logs';
  return {
    level: 'error',
    title: 'Diff write failed',
    body: `${path} — ${reason}`,
  };
}
