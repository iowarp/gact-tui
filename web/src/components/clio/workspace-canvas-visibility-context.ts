import { createContext, useContext } from 'react';

export const WorkspaceCanvasVisibilityContext = createContext(true);

export function useWorkspaceCanvasVisibility(): boolean {
  return useContext(WorkspaceCanvasVisibilityContext);
}
