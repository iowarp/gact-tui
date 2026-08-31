import { useEffect, useRef, type PropsWithChildren } from 'react';
import { useLocation } from 'react-router-dom';
import App from '@/App';
import {
  PromptInputProvider,
  usePromptInputController,
  useProviderAttachments,
} from '@/components/ai-elements/prompt-input';
import { AppErrorBoundary } from './app-error-boundary';

function ComposerDraftSessionBoundary({ children }: PropsWithChildren) {
  const location = useLocation();
  const match = /^\/workspaces\/([^/]+)\/sessions\/([^/]+)/.exec(location.pathname);
  const sessionKey = match ? `${match[1]}:${match[2]}` : undefined;
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

/** Resets a failed route when the user deliberately navigates elsewhere. */
export function RouteErrorBoundary() {
  const location = useLocation();
  const resetKey = `${location.pathname}${location.search}`;
  return (
    <PromptInputProvider>
      <ComposerDraftSessionBoundary>
        <AppErrorBoundary key={resetKey}>
          <App />
        </AppErrorBoundary>
      </ComposerDraftSessionBoundary>
    </PromptInputProvider>
  );
}
