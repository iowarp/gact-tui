import { useCallback, useSyncExternalStore } from 'react';

/**
 * The highlighted option of each composer suggestion menu, keyed by the id of
 * the popup the editor's `aria-controls` names. The menu owns its highlight so
 * arrowing through suggestions re-renders the menu and the editor's
 * `aria-activedescendant`, not the whole composer.
 */
const activeOptions = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

export function publishActiveOption(popupId: string, optionId: string | undefined): void {
  if (activeOptions.get(popupId) === optionId) return;
  if (optionId === undefined) activeOptions.delete(popupId);
  else activeOptions.set(popupId, optionId);
  listeners.get(popupId)?.forEach((listener) => listener());
}

/** The DOM id of the option the popup `popupId` has highlighted, if it is open. */
export function useActiveOption(popupId: string): string | undefined {
  const subscribe = useCallback(
    (listener: () => void) => {
      const set = listeners.get(popupId) ?? new Set();
      set.add(listener);
      listeners.set(popupId, set);
      return () => {
        set.delete(listener);
        if (!set.size) listeners.delete(popupId);
      };
    },
    [popupId],
  );
  const read = useCallback(() => activeOptions.get(popupId), [popupId]);
  return useSyncExternalStore(subscribe, read, read);
}
