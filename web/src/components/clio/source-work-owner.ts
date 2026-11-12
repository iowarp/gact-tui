import { createContext, useContext } from 'react';

/**
 * A new-conversation draft owns the source work started from it: the draft
 * becomes its conversation, and the first message then goes into that same
 * conversation instead of a second one.
 */
export const SourceWorkOwnerContext = createContext<(() => Promise<string>) | null>(null);

export function useSourceWorkOwner() {
  return useContext(SourceWorkOwnerContext);
}
