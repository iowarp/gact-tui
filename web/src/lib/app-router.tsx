import { startTransition, useLayoutEffect, useState, type ReactNode } from 'react';
import {
  Router,
  UNSAFE_createBrowserHistory as createBrowserHistory,
  type Location,
  type NavigationType,
} from 'react-router-dom';
import { LiveLocationContext } from './live-location';
import { isSettingsRoute } from './settings-window-route';

interface RouterState {
  action: NavigationType;
  location: Location;
}

/**
 * BrowserRouter, except that moving between Settings sections leaves the
 * router's location alone. React marks every consumer of the router location
 * when it changes, even under a nested provider that pins it, so a section
 * switch would otherwise re-render the workspace kept behind the window. The
 * Settings window reads the live location through `useLiveLocation`.
 */
export function AppRouter({ children }: { children: ReactNode }) {
  const [history] = useState(() => createBrowserHistory({ v5Compat: true }));
  const [live, setLive] = useState<RouterState>(() => ({
    action: history.action,
    location: history.location,
  }));
  useLayoutEffect(
    () =>
      history.listen(({ action, location }) =>
        startTransition(() => setLive({ action, location })),
      ),
    [history],
  );
  const [routed, setRouted] = useState(live);
  const withinSettings =
    isSettingsRoute(live.location.pathname) && isSettingsRoute(routed.location.pathname);
  if (routed !== live && !withinSettings) setRouted(live);
  return (
    <LiveLocationContext.Provider value={live.location}>
      <Router location={routed.location} navigationType={routed.action} navigator={history}>
        {children}
      </Router>
    </LiveLocationContext.Provider>
  );
}
