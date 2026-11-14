import { useSyncExternalStore } from 'react';

/**
 * The object selected in each open HDF5 file viewer, so the file frame's
 * Add to message can reference that dataset (`file::/path`) instead of the whole
 * file. Keyed by workspace and file path; the viewer writes, the frame reads.
 */
const selections = new Map<string, string>();
const listeners = new Set<() => void>();

/** Workspace and path, joined as the viewer frame keys its files. */
export const hdf5FileKey = (workspaceId: string, path: string) => `${workspaceId}\u0000${path}`;

export function setHdf5Selection(key: string, locator: string) {
  if (selections.get(key) === locator) return;
  selections.set(key, locator);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The selected object (`/group/dataset`), or undefined when none or the file root. */
export function useHdf5Selection(workspaceId?: string, path?: string): string | undefined {
  const locator = useSyncExternalStore(subscribe, () =>
    workspaceId && path ? selections.get(hdf5FileKey(workspaceId, path)) : undefined,
  );
  return locator && locator !== '/' ? locator : undefined;
}
