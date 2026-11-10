import { createContext, useContext } from 'react';

export const WorkspaceCanvasVisibilityContext = createContext(true);

export function useWorkspaceCanvasVisibility(): boolean {
  return useContext(WorkspaceCanvasVisibilityContext);
}

/**
 * Opens the pocket from inside it (a strip chord while it is collapsed), and
 * hands over a strip position (or Terminal, which has its own chord) chosen
 * while it was not mounted at all.
 */
export interface WorkspaceCanvasControl {
  show: () => void;
  pendingStripPosition?: number | 'terminal';
  clearPendingStripPosition: () => void;
  /**
   * A sparse list tab asks for only the pixels it needs; the rest goes back to
   * the conversation. `undefined` returns to the stored width.
   */
  fitWidth?: (pixels: number | undefined) => void;
  /** Closes the pocket from inside it (its last tab closed). */
  hide?: () => void;
}

export const WorkspaceCanvasControlContext = createContext<WorkspaceCanvasControl | undefined>(
  undefined,
);

export function useWorkspaceCanvasControl(): WorkspaceCanvasControl | undefined {
  return useContext(WorkspaceCanvasControlContext);
}

/** Ctrl K's "Open terminal" asks whichever pocket is mounted (or the shell) to open it. */
export const OPEN_TERMINAL_EVENT = 'clio:open-terminal';
