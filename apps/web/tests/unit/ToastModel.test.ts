import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_TOAST_DURATION_MS,
  DEFAULT_TOAST_DURATION_MS,
  appendToastHistory,
  appendVisibleToast,
  createToastHistoryEntry,
  createToastRecord,
  findDuplicateVisibleToast,
  type ToastHistoryEntry,
  type ToastRecord,
} from '../../src/components/ToastModel.js';

describe('ToastModel', () => {
  it('creates toast records with default and action durations', () => {
    expect(createToastRecord(1, { title: 'Info' })).toMatchObject({
      id: 1,
      title: 'Info',
      tone: 'info',
      duration: DEFAULT_TOAST_DURATION_MS,
    });

    const action = { label: 'Retry', onClick: vi.fn() };
    expect(createToastRecord(2, { title: 'Failed', action })).toMatchObject({
      id: 2,
      title: 'Failed',
      duration: ACTION_TOAST_DURATION_MS,
      action,
    });
  });

  it('creates newest-first history entries and applies the cap', () => {
    const old: ToastHistoryEntry = {
      id: 1,
      title: 'Old',
      tone: 'info',
      pushedAt: 100,
    };
    const record = createToastRecord(2, {
      title: 'Saved',
      body: 'Changes persisted',
      tone: 'success',
    });
    const entry = createToastHistoryEntry(record, 200);

    expect(entry).toEqual({
      id: 2,
      title: 'Saved',
      body: 'Changes persisted',
      tone: 'success',
      pushedAt: 200,
    });
    expect(appendToastHistory([old], entry, 1)).toEqual([entry]);
  });

  it('matches duplicate visible toasts by tone title and body', () => {
    const existing = createToastRecord(1, {
      title: 'Disconnected',
      body: 'Retrying',
      tone: 'warn',
    });
    const duplicate = createToastRecord(2, {
      title: 'Disconnected',
      body: 'Retrying',
      tone: 'warn',
    });
    const differentBody = createToastRecord(3, {
      title: 'Disconnected',
      body: 'Offline',
      tone: 'warn',
    });

    expect(findDuplicateVisibleToast([existing], duplicate)).toBe(existing);
    expect(findDuplicateVisibleToast([existing], differentBody)).toBeUndefined();
  });

  it('evicts the oldest non-pinned toast when the visible stack is full', () => {
    const current: ToastRecord[] = [
      createToastRecord(1, { title: 'Pinned', duration: 0 }),
      createToastRecord(2, { title: 'Old dismissible' }),
      createToastRecord(3, { title: 'Recent' }),
    ];
    const incoming = createToastRecord(4, { title: 'Incoming' });

    const result = appendVisibleToast(current, incoming, 3);

    expect(result.evictedId).toBe(2);
    expect(result.toasts.map((toast) => toast.id)).toEqual([1, 3, 4]);
  });

  it('keeps the newest pinned toasts when all visible entries are pinned', () => {
    const current: ToastRecord[] = [
      createToastRecord(1, { title: 'Pinned 1', duration: 0 }),
      createToastRecord(2, { title: 'Pinned 2', duration: 0 }),
    ];
    const incoming = createToastRecord(3, { title: 'Pinned 3', duration: 0 });

    const result = appendVisibleToast(current, incoming, 2);

    expect(result.evictedId).toBeUndefined();
    expect(result.toasts.map((toast) => toast.id)).toEqual([2, 3]);
  });
});
