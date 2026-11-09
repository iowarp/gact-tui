import { createContext, useContext, useEffect, useId } from 'react';

/**
 * The frame bar's What group: one or two short facts a renderer knows about
 * what it shows ("412 rows", "12 pages", "365×720×1440 f32", "+24 −3").
 * The shell adds the size; renderers contribute what only they can count.
 */
export const FileViewerFactsRegistry = createContext<
  ((id: string, facts?: readonly string[]) => void) | undefined
>(undefined);

/** Registers a renderer's facts with the enclosing frame bar; changes by content, not identity. */
export function useFileViewerFacts(facts: readonly string[] | undefined) {
  const register = useContext(FileViewerFactsRegistry);
  const id = useId();
  const key = facts?.join('\u0000');
  useEffect(() => {
    register?.(id, key === undefined ? undefined : key.split('\u0000').filter(Boolean));
    return () => register?.(id);
  }, [register, id, key]);
}
