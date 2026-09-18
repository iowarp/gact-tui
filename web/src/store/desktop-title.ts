import { create } from 'zustand';

export interface DesktopTitleContext {
  workspace?: string;
  session?: string;
  blueprint?: string;
}

interface DesktopTitleStore {
  context: DesktopTitleContext;
  setTitleContext: (context: DesktopTitleContext) => void;
  clearTitleContext: () => void;
}

const EMPTY_CONTEXT: DesktopTitleContext = {};

/**
 * The desktop title bar's centre context (`workspace › session`, with the
 * active blueprint as a badge) lives here so the title bar — mounted once
 * in App.tsx, outside every route — can show it without a prop threaded
 * through each route. The workspace route writes it via `setTitleContext`
 * as workspace/session/blueprint resolve; every other route (connection,
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
