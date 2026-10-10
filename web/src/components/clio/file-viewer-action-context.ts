import { createContext, useContext, useEffect, useId, type ComponentType } from 'react';

export interface FileViewerAction {
  label: string;
  /** Export formats belong beside the original file in the fixed download menu. */
  kind?: 'download';
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
}

export const FileViewerActionRegistry = createContext<
  ((id: string, actions?: readonly FileViewerAction[]) => void) | undefined
>(undefined);

/** Registers memoized renderer capabilities for the shared menu, retaining Radix's menu context. */
export function useFileViewerActions(actions: readonly FileViewerAction[]) {
  const register = useContext(FileViewerActionRegistry);
  const id = useId();
  useEffect(() => {
    register?.(id, actions);
    return () => register?.(id);
  }, [register, id, actions]);
}
