import { createContext, useContext } from 'react';

/**
 * Where the conversation rail can dock. The shell owns this: the rail docks
 * beside the conversation while the right pocket is closed and the window keeps
 * the conversation its minimum width; otherwise it floats as before.
 */
export interface ConversationRailDock {
  /** The column beside the conversation the docked rail renders into. */
  host: HTMLElement | null;
  /** The pocket is closed and there is room beside the conversation. */
  dockable: boolean;
  /** The right pocket (desktop panel or narrow sheet) is open. */
  pocketOpen: boolean;
}

const NO_DOCK: ConversationRailDock = { host: null, dockable: false, pocketOpen: false };

export const ConversationRailDockContext = createContext<ConversationRailDock>(NO_DOCK);

export function useConversationRailDock(): ConversationRailDock {
  return useContext(ConversationRailDockContext);
}

/** The docked rail's width: the spec's 22% of the window, never under 280 px. */
export function dockedRailWidth(windowWidth: number): number {
  return Math.max(280, Math.round(windowWidth * 0.22));
}
