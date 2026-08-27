import type { PropsWithChildren } from 'react';

import { WorkspaceCanvasVisibilityContext } from './workspace-canvas-visibility-context';

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
