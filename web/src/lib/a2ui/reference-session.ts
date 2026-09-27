import { createContext, useContext } from 'react';

/**
 * The session whose surface is rendering. A CLIO reference
 * (`artifact:` / `resource:` / bare id) is resolved by the service in the
 * context of that session (a workspace-less `resource:res_…` resolves in the
 * session's workspace), so every media/artifact component needs it. Provided
 * once per surface by `a2ui-surface.tsx`.
 */
const A2uiReferenceSessionContext = createContext<string | undefined>(undefined);

export const A2uiReferenceSessionProvider = A2uiReferenceSessionContext.Provider;

/** The rendering surface's session id, or `undefined` outside a surface. */
export function useA2uiReferenceSession(): string | undefined {
  return useContext(A2uiReferenceSessionContext);
}
