import type { PropsWithChildren } from 'react';

import {
  WorkspaceCanvasControlContext,
  WorkspaceCanvasVisibilityContext,
  type WorkspaceCanvasControl,
} from './workspace-canvas-visibility-context';

export function WorkspaceCanvasVisibilityProvider({
  children,
  control,
  visible,
}: PropsWithChildren<{ visible: boolean; control?: WorkspaceCanvasControl }>) {
  return (
    <WorkspaceCanvasVisibilityContext.Provider value={visible}>
      <WorkspaceCanvasControlContext.Provider value={control}>
        {children}
      </WorkspaceCanvasControlContext.Provider>
    </WorkspaceCanvasVisibilityContext.Provider>
  );
}
