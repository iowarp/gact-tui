import { createContext, useCallback, useContext, useState } from 'react';

/** The view each open tab's file shows, by tab scope and slot. */
const chosen = new Map<string, string>();
const SEPARATOR = '\u0000';

/**
 * The open tab a viewer belongs to. Its body remounts when the canvas
 * maximizes or restores and when the tab is left, so the view a person chose
 * is kept here rather than in the viewer's own state.
 */
export const RememberedViewScope = createContext<string | undefined>(undefined);

/**
 * Like `useState` for a viewer's chosen view, but kept for as long as its tab
 * stays open. Outside a tab it is ordinary state.
 */
export function useRememberedView(slot: string, initial: string) {
  const scope = useContext(RememberedViewScope);
  const key = scope === undefined ? undefined : `${scope}${SEPARATOR}${slot}`;
  const [value, setValue] = useState(() => (key && chosen.get(key)) ?? initial);
  const choose = useCallback(
    (next: string) => {
      setValue(next);
      if (key) chosen.set(key, next);
    },
    [key],
  );
  return [value, choose] as const;
}

/** A tab's scope: the same tab id can be open in another workspace. */
export function rememberedViewScope(workspaceId: string, tabId: string): string {
  return `${workspaceId}${SEPARATOR}${tabId}`;
}

/** A closed tab opens fresh next time: its chosen views are dropped. */
export function forgetRememberedViews(scopes: Iterable<string>): void {
  const prefixes = [...scopes].map((scope) => `${scope}${SEPARATOR}`);
  if (!prefixes.length) return;
  for (const key of chosen.keys())
    if (prefixes.some((prefix) => key.startsWith(prefix))) chosen.delete(key);
}
