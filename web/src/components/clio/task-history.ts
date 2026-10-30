import type { AsyncProcess } from '@clio/core/v3';
import { isSettledTaskActivity, taskActivity, type TaskActivity } from './task-activity';
export interface TaskPageControls {
  hasMore: boolean;
  pending: boolean;
  loadMore: () => Promise<unknown>;
  history?: {
    /** False leaves lazy history discoverable until its first read settles. */
    loaded?: boolean;
    visible: boolean;
    toggle: () => void;
    items: readonly AsyncProcess[];
    hasMore: boolean;
    pending: boolean;
    loadMore: () => Promise<unknown>;
    error: string;
  };
}

/** Retain unread/error/continuation states, but omit a verified empty history. */
export function showCompletedWork(
  history: TaskPageControls['history'],
  activity: readonly TaskActivity[] = [],
): boolean {
  return Boolean(
    history &&
      (history.loaded === false ||
        history.hasMore ||
        history.pending ||
        history.error ||
        activity.some(isSettledTaskActivity) ||
        taskActivity(history.items).some(isSettledTaskActivity)),
  );
}
