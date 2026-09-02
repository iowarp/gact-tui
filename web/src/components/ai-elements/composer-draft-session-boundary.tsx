import { useEffect, useRef, type PropsWithChildren } from 'react';
import { useMatch } from 'react-router-dom';
import { usePromptInputController, useProviderAttachments } from './prompt-input';

/**
 * Clears an in-progress composer draft (attachments + typed text) when the route moves from
 * one workspace/session pair to a DIFFERENT one, so a draft never leaks into the wrong session.
 *
 * The route pattern mirrors the workspace session route declared in App.tsx
 * (`/workspaces/:workspaceId/sessions/:sessionId`); matching it with react-router's own
 * `useMatch` — instead of a hand-rolled regex — keeps param extraction on the same rules the
 * router itself uses for that route.
 */
export function ComposerDraftSessionBoundary({ children }: PropsWithChildren) {
  const match = useMatch('/workspaces/:workspaceId/sessions/:sessionId');
  const sessionKey = match ? `${match.params.workspaceId}:${match.params.sessionId}` : undefined;
  const lastSessionKey = useRef<string | undefined>(undefined);
  const { clear: clearAttachments } = useProviderAttachments();
  const {
    textInput: { clear: clearInput },
  } = usePromptInputController();

  useEffect(() => {
    if (!sessionKey) return;
    if (lastSessionKey.current && lastSessionKey.current !== sessionKey) {
      clearAttachments();
      clearInput();
    }
    lastSessionKey.current = sessionKey;
  }, [clearAttachments, clearInput, sessionKey]);

  return children;
}
