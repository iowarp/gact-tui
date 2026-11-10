import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'clio.evidence-disclosures.v1';
const listeners = new Set<() => void>();
let snapshot: Readonly<Record<string, boolean>> | undefined;
let storedRaw: string | null | undefined;

function readChoices(): Readonly<Record<string, boolean>> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (snapshot && raw === storedRaw) return snapshot;
    storedRaw = raw;
    const value: unknown = JSON.parse(raw ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, open]) => typeof open === 'boolean'))
      : {};
  } catch {
    // Storage can be unavailable; choices still survive panel remounts in memory.
    return snapshot ?? {};
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const storageChanged = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      snapshot = readChoices();
      listener();
    }
  };
  window.addEventListener('storage', storageChanged);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', storageChanged);
  };
}

function getSnapshot(): Readonly<Record<string, boolean>> {
  return (snapshot = readChoices());
}

/** Remember named evidence sections across dismissal, layout changes and reloads. */
export function useEvidenceDisclosure(
  id: string,
  defaultOpen = true,
): [boolean, (open: boolean) => void] {
  const choices = useSyncExternalStore(subscribe, getSnapshot);
  const setOpen = useCallback(
    (open: boolean) => {
      snapshot = { ...getSnapshot(), [id]: open };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        // Restricted/full storage must not prevent changing the current view.
      }
      listeners.forEach((listener) => listener());
    },
    [id],
  );
  return [choices[id] ?? defaultOpen, setOpen];
}
