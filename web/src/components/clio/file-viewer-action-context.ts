import { createContext, useContext, useEffect, useId, type ComponentType } from 'react';

export interface FileViewerAction {
  label: string;
  description?: string;
  /** Alternate formats join Export to… beside the original-file download. */
  kind?: 'download' | 'view';
  selected?: boolean;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
  pending?: boolean;
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

/** Reads what the viewer shows as text, for Copy ▾ Contents. */
export type FileViewerContentsReader = () => string | undefined | Promise<string | undefined>;

/**
 * The frame's Copy ▾ face: a renderer that shows text (a document's text, a
 * file's decoded source) registers how to read it instead of adding its own
 * copy button; without one, the frame copies text files from their bytes.
 */
export const FileViewerContentsRegistry = createContext<
  ((id: string, read?: FileViewerContentsReader) => void) | undefined
>(undefined);

export function useFileViewerContentsRegistry() {
  return useContext(FileViewerContentsRegistry);
}
