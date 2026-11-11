import { useSyncExternalStore } from 'react';

export const NOTIFICATION_READS_STORAGE_KEY = 'clio.notification-reads.v1';

/** Conversations remembered as opened; older entries drop first. */
const MAX_SEEN = 300;

export interface NotificationReads {
  /** When this browser started keeping notifications; nothing earlier is news. */
  since: string;
  /** "Mark all read": everything up to here shows as read. */
  readThrough: string;
  /** When each conversation was last open, by session id. */
  seen: Readonly<Record<string, string>>;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function load(): NotificationReads {
  const now = new Date().toISOString();
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(NOTIFICATION_READS_STORAGE_KEY) ?? 'null',
    );
    if (stored && typeof stored === 'object') {
      const value = stored as Record<string, unknown>;
      const since = typeof value.since === 'string' ? value.since : now;
      return {
        since,
        readThrough: typeof value.readThrough === 'string' ? value.readThrough : since,
        seen: stringRecord(value.seen),
      };
    }
  } catch {
    // Unreadable storage starts fresh; it is a convenience, not a record.
  }
  const fresh = { since: now, readThrough: now, seen: {} };
  persist(fresh);
  return fresh;
}

function persist(value: NotificationReads) {
  try {
    window.localStorage.setItem(NOTIFICATION_READS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Full or blocked storage keeps this tab's state only.
  }
}

let current: NotificationReads | undefined;
const listeners = new Set<() => void>();

function snapshot(): NotificationReads {
  current ??= load();
  return current;
}

function update(next: NotificationReads) {
  current = next;
  persist(next);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const sync = (event: StorageEvent) => {
    if (event.key !== NOTIFICATION_READS_STORAGE_KEY) return;
    current = load();
    listener();
  };
  window.addEventListener('storage', sync);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', sync);
  };
}

export function useNotificationReads(): NotificationReads {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Everything listed so far reads as read. */
export function markAllNotificationsRead(at = new Date().toISOString()) {
  update({ ...snapshot(), readThrough: at });
}

/** The conversation is open now: what it did while away is no longer news. */
export function markConversationSeen(sessionId: string, at = new Date().toISOString()) {
  const reads = snapshot();
  if (!sessionId || Date.parse(reads.seen[sessionId] ?? '') >= Date.parse(at)) return;
  const entries = Object.entries({ ...reads.seen, [sessionId]: at })
    .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
    .slice(0, MAX_SEEN);
  update({ ...reads, seen: Object.fromEntries(entries) });
}

/** Tests start each case from empty storage. */
export function resetNotificationReadsForTest() {
  current = undefined;
}
