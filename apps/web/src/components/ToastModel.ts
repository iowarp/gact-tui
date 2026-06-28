/**
 * View-model / pure logic for Toast: state shaping and helpers, no DOM. Key export `ToastTone`.
 */
import type { IconName } from './Icon.js';

export type ToastTone = 'info' | 'success' | 'warn' | 'error';

/** Clickable next-action on a toast — the thing that turns an error
 * notification from a dead-end into a recovery path. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  title: string;
  body?: string;
  tone?: ToastTone;
  /** Auto-dismiss after this many ms. Defaults to 4500; 0 disables. */
  duration?: number;
  icon?: IconName;
  /** Optional action button (e.g. Retry / Open settings / Reconnect now). */
  action?: ToastAction;
  /** Record into the notification-center history WITHOUT showing a
   * visible toast — for ambient events that belong in the bell, not
   * on screen. */
  silent?: boolean;
  /** Stable test hook placed on the rendered toast element (data-testid). */
  testId?: string;
}

export interface ToastRecord {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
  duration: number;
  icon?: IconName;
  action?: ToastAction;
  testId?: string;
}

export interface ToastHistoryEntry {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
  /** Epoch ms when the toast was pushed. */
  pushedAt: number;
}

export const TOAST_HISTORY_LIMIT = 50;
export const TOAST_MAX_VISIBLE = 5;
export const DEFAULT_TOAST_DURATION_MS = 4500;
export const ACTION_TOAST_DURATION_MS = 8000;

export function createToastRecord(id: number, input: ToastInput): ToastRecord {
  return {
    id,
    title: input.title,
    body: input.body,
    icon: input.icon,
    tone: input.tone ?? 'info',
    duration:
      input.duration ??
      (input.action ? ACTION_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS),
    action: input.action,
    ...(input.testId ? { testId: input.testId } : {}),
  };
}

export function createToastHistoryEntry(
  record: ToastRecord,
  pushedAt = Date.now(),
): ToastHistoryEntry {
  return {
    id: record.id,
    title: record.title,
    ...(record.body ? { body: record.body } : {}),
    tone: record.tone,
    pushedAt,
  };
}

export function appendToastHistory(
  current: readonly ToastHistoryEntry[],
  entry: ToastHistoryEntry,
  limit = TOAST_HISTORY_LIMIT,
): ToastHistoryEntry[] {
  return [entry, ...current].slice(0, limit);
}

export function findDuplicateVisibleToast(
  toasts: readonly ToastRecord[],
  next: ToastRecord,
): ToastRecord | undefined {
  return toasts.find(
    (toast) =>
      toast.tone === next.tone &&
      toast.title === next.title &&
      toast.body === next.body,
  );
}

export interface VisibleToastAppendResult {
  toasts: ToastRecord[];
  evictedId?: number;
}

export function appendVisibleToast(
  current: readonly ToastRecord[],
  nextToast: ToastRecord,
  maxVisible = TOAST_MAX_VISIBLE,
): VisibleToastAppendResult {
  const next = [...current, nextToast];
  if (next.length <= maxVisible) return { toasts: next };

  const evictIdx = next.findIndex((toast) => toast.duration > 0);
  if (evictIdx === -1) {
    return { toasts: next.slice(-maxVisible) };
  }

  const [evicted] = next.splice(evictIdx, 1);
  return {
    toasts: next,
    ...(evicted ? { evictedId: evicted.id } : {}),
  };
}
