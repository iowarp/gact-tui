import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type SetStateAction,
} from 'react';

interface AttentionDraftStore {
  scope: string;
  get<T>(key: string, initial: T): T;
  set<T>(key: string, next: SetStateAction<T>, initial: T): void;
  subscribe(listener: () => void): () => void;
}

/** Conversation-owned drafts survive responsive composer remounts. Never persisted to disk. */
export function createAttentionDraftStore(scope = ''): AttentionDraftStore {
  const values = new Map<string, unknown>();
  const listeners = new Set<() => void>();
  return {
    scope,
    get: <T>(key: string, initial: T): T => (values.has(key) ? (values.get(key) as T) : initial),
    set: <T>(key: string, next: SetStateAction<T>, initial: T) => {
      const previous = values.has(key) ? (values.get(key) as T) : initial;
      const value = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
      if (Object.is(previous, value)) return;
      values.set(key, value);
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const AttentionDraftContext = createContext<AttentionDraftStore | null>(null);

/** Local fallback keeps standalone question surfaces independent of the workspace. */
export function useAttentionDraft<T>(
  key: string,
  initial: T | (() => T),
): [T, (next: SetStateAction<T>) => void] {
  const context = useContext(AttentionDraftContext);
  const [fallback] = useState<AttentionDraftStore>(() => createAttentionDraftStore());
  const [initialValue] = useState(initial);
  const store = context ?? fallback;
  const snapshot = useCallback(() => store.get(key, initialValue), [store, key, initialValue]);
  const value = useSyncExternalStore(store.subscribe, snapshot, snapshot);
  const setValue = useCallback(
    (next: SetStateAction<T>) => store.set(key, next, initialValue),
    [store, key, initialValue],
  );
  return [value, setValue];
}
