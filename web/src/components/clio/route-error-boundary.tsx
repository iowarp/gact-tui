import { useLocation } from 'react-router-dom';
import App from '@/App';
import { ComposerDraftSessionBoundary } from '@/components/ai-elements/composer-draft-session-boundary';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { AppErrorBoundary } from './app-error-boundary';

/** Resets a failed route when the user deliberately navigates elsewhere. */
export function RouteErrorBoundary() {
  const location = useLocation();
  const resetKey = `${location.pathname}${location.search}`;
  return (
    <AppErrorBoundary key={resetKey}>
      <PromptInputProvider>
        <ComposerDraftSessionBoundary>
          <App />
        </ComposerDraftSessionBoundary>
      </PromptInputProvider>
    </AppErrorBoundary>
  );
}
