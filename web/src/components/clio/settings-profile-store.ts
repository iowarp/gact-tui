import { useSyncExternalStore } from 'react';

/** The person's own details, kept only in this browser's storage. */
export interface LocalProfile {
  name: string;
  email: string;
  about: string;
}

export const PROFILE_STORAGE_KEY = 'clio.profile.v1';
const EMPTY_PROFILE: LocalProfile = { name: '', email: '', about: '' };
const listeners = new Set<() => void>();
let current = EMPTY_PROFILE;
let lastRaw: string | null | undefined;

function normalizeProfile(value: unknown): LocalProfile {
  if (!value || typeof value !== 'object') return EMPTY_PROFILE;
  const item = value as Record<string, unknown>;
  const text = (field: unknown) => (typeof field === 'string' ? field : '');
  return { name: text(item.name), email: text(item.email), about: text(item.about) };
}

function snapshot(): LocalProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw !== lastRaw) {
      lastRaw = raw;
      try {
        current = normalizeProfile(JSON.parse(raw ?? 'null'));
      } catch {
        current = EMPTY_PROFILE;
      }
    }
  } catch {
    // Unavailable storage keeps the profile in memory for this tab.
  }
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === PROFILE_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The local profile and its saver; other tabs follow through the storage event. */
export function useLocalProfile(): { profile: LocalProfile; save: (next: LocalProfile) => void } {
  const profile = useSyncExternalStore(subscribe, snapshot, () => EMPTY_PROFILE);
  const save = (next: LocalProfile) => {
    current = normalizeProfile({
      name: next.name.trim(),
      email: next.email.trim(),
      about: next.about.trim(),
    });
    try {
      const raw = JSON.stringify(current);
      localStorage.setItem(PROFILE_STORAGE_KEY, raw);
      lastRaw = raw;
    } catch {
      // Storage is full or restricted; the saved values stay for this tab.
    }
    listeners.forEach((listener) => listener());
  };
  return { profile, save };
}
