import { useSyncExternalStore } from 'react';
import {
  defaultSessionRailLayout,
  normalizeSessionRailLayout,
  type SessionRailLayout,
} from '@/components/clio/session-rail-layout';

export const SESSION_RAIL_STORAGE_KEY = 'clio.session-rail.v1';
const listeners = new Set<() => void>();
let current = defaultSessionRailLayout();
let lastRaw: string | null | undefined;

function snapshot(): SessionRailLayout {
  try {
    const raw = localStorage.getItem(SESSION_RAIL_STORAGE_KEY);
    if (raw !== lastRaw) {
      lastRaw = raw;
      try {
        current = normalizeSessionRailLayout(JSON.parse(raw ?? 'null'));
      } catch {
        current = defaultSessionRailLayout();
      }
    }
  } catch {
    // An unavailable browser store must not prevent changing this view in memory.
  }
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_RAIL_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** One personal layout shared by session rails on this browser/device. */
export function useSessionRailLayout() {
  const layout = useSyncExternalStore(subscribe, snapshot);
  const save = (value: SessionRailLayout) => {
    current = normalizeSessionRailLayout(value);
    try {
      const raw = JSON.stringify(current);
      localStorage.setItem(SESSION_RAIL_STORAGE_KEY, raw);
      lastRaw = raw;
    } catch {
      // Preserve the current in-memory preference when storage is full/restricted.
    }
    listeners.forEach((listener) => listener());
  };
  return { layout, save, reset: () => save(defaultSessionRailLayout()) };
}
