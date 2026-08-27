import { createContext, useContext, type PropsWithChildren } from 'react';

const WorkspaceCanvasVisibilityContext = createContext(true);

export function WorkspaceCanvasVisibilityProvider({
  children,
  visible,
}: PropsWithChildren<{ visible: boolean }>) {
  return (
    <WorkspaceCanvasVisibilityContext.Provider value={visible}>
      {children}
    </WorkspaceCanvasVisibilityContext.Provider>
  );
}

export function useWorkspaceCanvasVisibility(): boolean {
  return useContext(WorkspaceCanvasVisibilityContext);
}
