import type { Location } from 'react-router-dom';
import type { ApplicationDestination } from './application-destinations';
import { returnRouteFromState } from './workspace-route-memory';

export const SETTINGS_ROUTE_PREFIX = '/settings/';

export function isSettingsRoute(pathname: string): boolean {
  return pathname.startsWith(SETTINGS_ROUTE_PREFIX);
}

/**
 * The workspace that stays mounted behind the Settings window. Only a route the
 * app itself recorded when opening Settings qualifies: a remembered route from
 * an earlier visit can be stale and redirect, which would close the window.
 */
export function settingsBackgroundRoute(
  location: Pick<Location, 'pathname' | 'state'>,
  endpoint: string,
): string | undefined {
  if (!isSettingsRoute(location.pathname)) return undefined;
  const state: unknown = location.state;
  if (!state || typeof state !== 'object' || !('from' in state) || 'detached' in state)
    return undefined;
  const route = returnRouteFromState(state, endpoint);
  return route === state.from && route.startsWith('/workspaces/') ? route : undefined;
}

/** A folded page (Helper models, Remote tools, Browser) highlights the page that hosts it. */
export function hostSection(sections: readonly Pick<ApplicationDestination, 'id' | 'host'>[], section: string): string {
  return sections.find((item) => item.id === section)?.host ?? section;
}
