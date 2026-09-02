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
    // Outer boundary is UNKEYED: it must stay mounted across navigation, or the
    // PromptInputProvider it wraps would remount on every route change and the composer
    // draft (which lives only in that provider's state, not persisted) would be wiped on
    // every navigation — not just the workspace/session changes ComposerDraftSessionBoundary
    // exists to react to. It still catches a throw from the provider or that boundary.
    <AppErrorBoundary>
      <PromptInputProvider>
        <ComposerDraftSessionBoundary>
          {/* Inner boundary is keyed by route: it resets a failed route view without
              disturbing the composer state held above it. */}
          <AppErrorBoundary key={resetKey}>
            <App />
          </AppErrorBoundary>
        </ComposerDraftSessionBoundary>
      </PromptInputProvider>
    </AppErrorBoundary>
  );
}
