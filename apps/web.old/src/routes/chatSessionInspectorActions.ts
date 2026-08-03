/**
 * Action factory for inspector-panel operations on the active session.
 * Exports {@link createChatSessionInspectorActions}.
 */
import type { Accessor } from 'solid-js';
import type { Client, SessionTask } from '@clio/core';

export interface ChatSessionInspectorActionsOptions {
  activeId: Accessor<string>;
  client: Pick<Client, 'patchSessionTask' | 'sessionContextFrame'>;
  failToast: (title: string, error: unknown, retry?: () => void) => void;
  refetchTasks: () => unknown;
}

export function createChatSessionInspectorActions(options: ChatSessionInspectorActionsOptions) {
  async function cycleTaskStatus(taskId: string, next: SessionTask['status']) {
    try {
      await options.client.patchSessionTask(taskId, { status: next });
      void options.refetchTasks();
    } catch (error) {
      options.failToast('Could not update task', error, () => void cycleTaskStatus(taskId, next));
    }
  }

  function loadFrameDetail(frameId: string): Promise<Record<string, unknown>> {
    const sid = options.activeId();
    if (!sid) return Promise.reject(new Error('no active session'));
    return options.client.sessionContextFrame(sid, frameId);
  }

  return {
    cycleTaskStatus,
    loadFrameDetail,
  };
}
