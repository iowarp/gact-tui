import { useSyncExternalStore } from 'react';

let acceptsImages = false;
const listeners = new Set<() => void>();

/** Keep renderer-only image actions aligned with the model selected in the composer. */
export function setModelImageInput(accepts: boolean): void {
  if (acceptsImages === accepts) return;
  acceptsImages = accepts;
  for (const listener of listeners) listener();
}

/** Whether the selected conversation model can receive an image attachment. */
export function useModelImageInput(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => acceptsImages,
    () => false,
  );
}
