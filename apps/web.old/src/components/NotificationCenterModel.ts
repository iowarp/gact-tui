/**
 * View-model / pure logic for Notification Center: state shaping and helpers, no DOM. Key export `NotificationToneFilter`.
 */
import type { IconName } from './Icon.js';
import type { ToastHistoryEntry, ToastTone } from './Toast.js';
import { fuzzyRank } from '../fuzzy.js';

export type NotificationToneFilter = ToastTone | 'all';

/** Tone filter chips shown above the list. */
export const TONE_FILTERS: Array<{ key: NotificationToneFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'error', label: 'Errors' },
  { key: 'warn', label: 'Warnings' },
  { key: 'success', label: 'Success' },
  { key: 'info', label: 'Info' },
];

export function filterNotificationHistory(
  entries: readonly ToastHistoryEntry[],
  toneFilter: NotificationToneFilter,
  query: string,
): ToastHistoryEntry[] {
  const toneFiltered =
    toneFilter === 'all' ? [...entries] : entries.filter((entry) => entry.tone === toneFilter);
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return toneFiltered;
  return fuzzyRank(
    toneFiltered,
    normalizedQuery,
    (entry) => entry.title,
    (entry) => entry.body ?? '',
  );
}

export function notificationIconFor(tone: ToastTone): IconName {
  switch (tone) {
    case 'success':
      return 'check';
    case 'warn':
      return 'alert';
    case 'error':
      return 'alert';
    case 'info':
    default:
      return 'sparkle';
  }
}

export function humanNotificationTime(epoch: number, now = Date.now()): string {
  const delta = now - epoch;
  if (delta < 60_000) return 'just now';
  const min = Math.round(delta / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
