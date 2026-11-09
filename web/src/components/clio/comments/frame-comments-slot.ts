import { createContext, useContext } from 'react';

/**
 * The frame bar's Comments place. A viewer inside a frame puts its one
 * Comments icon here instead of floating its own controls over the content;
 * the frame shows a disabled icon, with the reason, when nothing claims it.
 */
export interface FrameCommentsSlotValue {
  host: HTMLElement | null;
  /** Marks the place as taken while mounted; returns the release. */
  claim: () => () => void;
}

export const FrameCommentsSlot = createContext<FrameCommentsSlotValue | undefined>(undefined);

/** Whether this viewer sits in a frame bar with a Comments place. */
export function useInFrameComments(): boolean {
  return useContext(FrameCommentsSlot) !== undefined;
}
