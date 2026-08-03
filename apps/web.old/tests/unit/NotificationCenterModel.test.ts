import { describe, expect, it } from 'vitest';
import type { ToastHistoryEntry } from '../../src/components/Toast.js';
import {
  filterNotificationHistory,
  humanNotificationTime,
  notificationIconFor,
  TONE_FILTERS,
} from '../../src/components/NotificationCenterModel.js';

const NOW = 1_700_000_000_000;

const HISTORY: ToastHistoryEntry[] = [
  {
    id: 1,
    title: 'CLIO responded',
    body: 'turn completed in 12s',
    tone: 'success',
    pushedAt: NOW,
  },
  {
    id: 2,
    title: 'Send failed',
    body: 'network unreachable',
    tone: 'error',
    pushedAt: NOW,
  },
  {
    id: 3,
    title: 'Permission requested',
    body: 'WriteFile wants access',
    tone: 'warn',
    pushedAt: NOW,
  },
];

describe('NotificationCenterModel', () => {
  it('declares tone filters in display order', () => {
    expect(TONE_FILTERS.map((filter) => filter.key)).toEqual([
      'all',
      'error',
      'warn',
      'success',
      'info',
    ]);
  });

  it('filters history by tone', () => {
    expect(filterNotificationHistory(HISTORY, 'error', '').map((entry) => entry.id)).toEqual([2]);
    expect(filterNotificationHistory(HISTORY, 'all', '').map((entry) => entry.id)).toEqual([
      1,
      2,
      3,
    ]);
  });

  it('fuzzy-searches title and body text after tone filtering', () => {
    expect(
      filterNotificationHistory(HISTORY, 'all', 'unreachable').map((entry) => entry.id),
    ).toEqual([2]);
    expect(
      filterNotificationHistory(HISTORY, 'success', 'responded').map((entry) => entry.id),
    ).toEqual([1]);
    expect(filterNotificationHistory(HISTORY, 'error', 'responded')).toEqual([]);
  });

  it('maps tones to notification icons', () => {
    expect(notificationIconFor('success')).toBe('check');
    expect(notificationIconFor('warn')).toBe('alert');
    expect(notificationIconFor('error')).toBe('alert');
    expect(notificationIconFor('info')).toBe('sparkle');
  });

  it('formats relative notification times', () => {
    expect(humanNotificationTime(NOW - 10_000, NOW)).toBe('just now');
    expect(humanNotificationTime(NOW - 2 * 60_000, NOW)).toBe('2m ago');
    expect(humanNotificationTime(NOW - 3 * 60 * 60_000, NOW)).toBe('3h ago');
    expect(humanNotificationTime(NOW - 2 * 24 * 60 * 60_000, NOW)).toBe('2d ago');
  });
});
