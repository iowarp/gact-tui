import { createContext, useContext } from 'react';

export const WorkspaceCanvasVisibilityContext = createContext(true);

export function useWorkspaceCanvasVisibility(): boolean {
  return useContext(WorkspaceCanvasVisibilityContext);
}

/**
 * Opens the pocket from inside it (a strip chord while it is collapsed), and
 * hands over a strip position chosen while it was not mounted at all.
 */
export interface WorkspaceCanvasControl {
  show: () => void;
  pendingStripPosition?: number;
  clearPendingStripPosition: () => void;
}

export const WorkspaceCanvasControlContext = createContext<WorkspaceCanvasControl | undefined>(
  undefined,
);

export function useWorkspaceCanvasControl(): WorkspaceCanvasControl | undefined {
  return useContext(WorkspaceCanvasControlContext);
}
