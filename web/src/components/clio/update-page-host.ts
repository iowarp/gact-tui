import { useEffect, useSyncExternalStore } from 'react';
import { useUpdateFlowStore, type UpdateStep } from '@/store/update-flow-store';

let hosts = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setHosts(next: number) {
  hosts = next;
  for (const listener of listeners) listener();
}

/** An update running, or one that failed and has not been dismissed. */
export function updatePageShown(step: UpdateStep): boolean {
  return step !== 'idle' && step !== 'done';
}

/**
 * For the app shell: the update page takes its content pane. Returns whether
 * it shows now. While a pane hosts it, the window-wide fallback stays away.
 */
export function useUpdatePane(): boolean {
  useEffect(() => {
    setHosts(hosts + 1);
    return () => setHosts(hosts - 1);
  }, []);
  return useUpdateFlowStore((state) => updatePageShown(state.step));
}

/** True while some mounted shell shows the update page in its pane. */
export function useUpdatePaneHosted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hosts > 0,
    () => false,
  );
}
