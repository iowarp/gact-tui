import { create } from 'zustand';

export interface DesktopTitleContext {
  workspace?: string;
  session?: string;
  /** The name of the agent the current conversation runs. */
  agent?: string;
  /** Opens the conversation's agent panel, as the in-page agent button does. */
  onOpenAgent?: () => void;
}

interface DesktopTitleStore {
  context: DesktopTitleContext;
  setTitleContext: (context: DesktopTitleContext) => void;
  clearTitleContext: () => void;
}

const EMPTY_CONTEXT: DesktopTitleContext = {};

/**
 * The desktop title bar's centre context (`workspace › session`, with the
 * conversation's agent as a badge) lives here so the title bar — mounted once
 * in App.tsx, outside every route — can show it without a prop threaded
 * through each route. The workspace route writes it via `setTitleContext`
 * as workspace, session and agent resolve; every other route (connection,
 * runs, infrastructure, settings) never calls it, so `DesktopTitleContext`
 * falls back to the product name on its own. `clearTitleContext` is called
 * on the workspace route's unmount so a stale session title never lingers
 * after navigating away.
 */
export const useDesktopTitleStore = create<DesktopTitleStore>((set) => ({
  context: EMPTY_CONTEXT,
  setTitleContext: (context) => set({ context }),
  clearTitleContext: () => set({ context: EMPTY_CONTEXT }),
}));
