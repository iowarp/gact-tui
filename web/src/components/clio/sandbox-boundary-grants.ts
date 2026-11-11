import { useSyncExternalStore } from 'react';

/**
 * What the person did with each blocked folder on this page: one state per workspace and
 * folder, so the notice on the message and the one in the call's row agree.
 */
export type FolderGrantState = 'pending' | 'granted' | string;

const states = new Map<string, FolderGrantState>();
const listeners = new Set<() => void>();
let version = 0;

const keyOf = (workspaceId: string, root: string) => `${workspaceId}\u0000${root}`;

export function setFolderGrant(workspaceId: string, root: string, state: FolderGrantState): void {
  states.set(keyOf(workspaceId, root), state);
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The state of each folder in `roots` for this workspace (absent: not acted on yet). */
export function useFolderGrants(
  workspaceId: string | undefined,
  roots: string[],
): Record<string, FolderGrantState> {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  if (!workspaceId) return {};
  return Object.fromEntries(
    roots.flatMap((root) => {
      const state = states.get(keyOf(workspaceId, root));
      return state ? [[root, state] as const] : [];
    }),
  );
}
