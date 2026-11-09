import { createContext, useContext } from 'react';

export interface TabListSlot {
  /** Where the list renders; null while the column is not shown. */
  host: HTMLElement | null;
  /** The active tab's list title ("Study", "Outline"), once a tab claims the column. */
  title?: string;
  shown: boolean;
  claim: (title: string) => () => void;
  setShown: (shown: boolean) => void;
  /** After a pick in the list: over a narrow panel the list steps aside. */
  picked: () => void;
}

export const WorkbenchTabListSlot = createContext<TabListSlot | null>(null);

/** Closes a narrow panel's list sheet after a pick in it; a no-op beside the tabs. */
export function useWorkbenchTabListPicked(): () => void {
  const slot = useContext(WorkbenchTabListSlot);
  return slot?.picked ?? noop;
}

function noop() {}
