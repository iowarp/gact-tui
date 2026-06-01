/**
 * Notification preferences (W3 Tier-1 settings depth).
 *
 * Controls which toast categories fire. Error toasts always fire — they
 * carry recovery actions and silencing them would hide failures.
 * Persisted in localStorage so the choice survives reloads; read through
 * a signal so Settings toggles take effect immediately without a reload.
 */
import { createSignal } from 'solid-js';

export interface NotifPrefs {
  /** "CLIO responded" success toast after each completed turn. */
  turnCompletions: boolean;
  /** SSE disconnected / reconnected status toasts. */
  connectionStatus: boolean;
}

const KEY = 'clio.notif-prefs.v1';

const DEFAULTS: NotifPrefs = {
  turnCompletions: true,
  connectionStatus: true,
};

function load(): NotifPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<NotifPrefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

const [prefs, setPrefs] = createSignal<NotifPrefs>(load());

/** Reactive accessor — gate toast pushes on this. */
export const notifPrefs = prefs;

/** Update one preference and persist. */
export function setNotifPref<K extends keyof NotifPrefs>(
  key: K,
  value: NotifPrefs[K],
): void {
  const next = { ...prefs(), [key]: value };
  setPrefs(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota — ignore */
  }
}
