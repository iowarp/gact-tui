import { createContext, useContext, useState, type ReactNode } from 'react';

/** Shows a dialog outside the left bar, closing the phone sheet first. */
export const LeftBarDialogContext = createContext<((dialog: ReactNode) => void) | null>(null);

/**
 * A dialog opened from a left-bar row. Under the navigation's host it renders
 * outside the phone sheet, so closing the sheet does not unmount it; without a
 * host it renders in the caller's own slot.
 */
export function useLeftBarDialog(): [ReactNode, (dialog: ReactNode) => void] {
  const host = useContext(LeftBarDialogContext);
  const [local, setLocal] = useState<ReactNode>(null);
  return [host ? null : local, host ?? setLocal];
}
