import { create } from 'zustand';

export interface DesktopTitleContext {
  workspace?: string;
  session?: string;
  blueprint?: string;
  /** Mirrors `showsBaseAgent` (`@/lib/session-state`) for the current route's
   * session/blueprint, so the badge can show the "Base agent" fallback the
   * same way the in-page session context bar does. */
  showsBaseAgent?: boolean;
  /** Opens the active blueprint the same way the in-page session context
   * bar's blueprint button does; undefined when there is none to open
   * (`blueprint` unset, or the route never wires this in). */
  onOpenBlueprint?: () => void;
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
