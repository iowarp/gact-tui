import { useState } from 'react';
import { matchPath } from 'react-router-dom';
import App from '@/App';
import { useLiveLocation } from '@/lib/live-location';
import { isSettingsRoute, settingsBackgroundRoute } from '@/lib/settings-window-route';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ComposerDraftSessionBoundary } from '@/components/ai-elements/composer-draft-session-boundary';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { AppErrorBoundary } from './app-error-boundary';
import { ClioCommandMenu } from './command-menu';
import { SelectionActionsProvider } from './selection-actions';

/** Resets a failed route when the user deliberately navigates elsewhere. */
export function RouteErrorBoundary() {
  const location = useLiveLocation();
  const { settings } = useConnectionSettings();
  // Settings opens as a window over the workspace: the workspace keeps its
  // route boundary and its own search owner underneath.
  const background = settingsBackgroundRoute(location, settings.endpoint);
  // The in-app connect dialog opens over the page it came from, so that page
  // keeps its boundary too. A page's own query (a selected run, an inventory
  // filter) changes in place: keying on it would remount the whole app and drop
  // that page's state. Only the connect screen's intent/mode starts it afresh. A
  // detached Settings window (no workspace behind it) is one page: moving between
  // its sections must not remount the app either.
  const page = {
    pathname: location.pathname,
    key: isSettingsRoute(location.pathname)
      ? '/settings'
      : location.pathname === '/'
        ? `/${location.search}`
        : location.pathname,
  };
  const [lastPage, setLastPage] = useState<typeof page | null>(null);
  const connecting =
    location.pathname === '/' && new URLSearchParams(location.search).get('intent') === 'connect';
  if (!connecting && !background && lastPage?.key !== page.key) setLastPage(page);
  const behind = connecting && lastPage && lastPage.pathname !== '/' ? lastPage : null;
  const resetKey = background ?? behind?.key ?? page.key;
  const pathname = background ?? behind?.pathname ?? location.pathname;
  return (
    // Outer boundary is UNKEYED: it must stay mounted across navigation, or the
    // PromptInputProvider it wraps would remount on every route change and the composer
    // draft (which lives only in that provider's state, not persisted) would be wiped on
    // every navigation — not just the workspace/session changes ComposerDraftSessionBoundary
    // exists to react to. It still catches a throw from the provider or that boundary.
    <AppErrorBoundary>
      <PromptInputProvider>
        <SelectionActionsProvider>
          <ComposerDraftSessionBoundary>
            {/* Global search must survive the route reset, including a shortcut
                pressed while a lazy destination is still loading. WorkspacePage
                retains its own search owner with canvas resource callbacks. */}
            {!matchPath('/workspaces/:workspaceId/sessions/:sessionId', pathname) ? (
              <ClioCommandMenu />
            ) : null}
            {/* Inner boundary is keyed by route: it resets a failed route view without
                disturbing the composer or global search state held above it. */}
            <AppErrorBoundary key={resetKey}>
              <App />
            </AppErrorBoundary>
          </ComposerDraftSessionBoundary>
        </SelectionActionsProvider>
      </PromptInputProvider>
    </AppErrorBoundary>
  );
}
