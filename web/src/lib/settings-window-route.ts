import type { Location } from 'react-router-dom';
import type { ApplicationDestination } from './application-destinations';
import { matchesGlobalSearch } from './global-search-commands';
import { returnRouteFromState } from './workspace-route-memory';

export const SETTINGS_ROUTE_PREFIX = '/settings/';

export function isSettingsRoute(pathname: string): boolean {
  return pathname.startsWith(SETTINGS_ROUTE_PREFIX);
}

/** The Settings window covers the page now; read at key or request time. */
export function settingsWindowOpen(): boolean {
  return typeof window !== 'undefined' && isSettingsRoute(window.location.pathname);
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

/** React Router's position of the current entry in this tab's history, when it records one. */
export function historyIndex(): number | undefined {
  const state: unknown = window.history.state;
  return state && typeof state === 'object' && 'idx' in state && typeof state.idx === 'number'
    ? state.idx
    : undefined;
}

/**
 * How closing Settings returns: back over its own entries when the app opened it
 * (so browser Forward can reopen it and no second copy of the page is pushed), or a
 * replace when it was opened from a direct link with nothing of the app behind it.
 */
export function settingsCloseStep(openedAt: number | undefined, now: number | undefined) {
  return openedAt !== undefined && openedAt > 0 && now !== undefined && now >= openedAt
    ? openedAt - now - 1
    : undefined;
}

/** A folded page (Helper models, Remote tools, Browser) highlights the page that hosts it. */
export function hostSection(
  sections: readonly Pick<ApplicationDestination, 'id' | 'host'>[],
  section: string,
): string {
  return sections.find((item) => item.id === section)?.host ?? section;
}

/**
 * The listed sections a settings search matches: by name, scope or keywords,
 * or through a page folded into them (a "fleet" match keeps Models).
 */
export function matchingSettingsSections(
  sections: readonly Pick<ApplicationDestination, 'id' | 'host' | 'label' | 'group' | 'keywords'>[],
  filter: string,
): Set<string> {
  const matched = new Set<string>();
  for (const item of sections) {
    if (matchesGlobalSearch(filter, item.label, 'Settings', item.group, item.keywords))
      matched.add(item.host ?? item.id);
  }
  return matched;
}

/** Route state that arrived from the global search, which only the first section shows. */
export function withoutSearchArrival(state: unknown): unknown {
  if (!state || typeof state !== 'object' || !('fromSearch' in state)) return state;
  const { fromSearch: _arrival, ...rest } = state as Record<string, unknown>;
  return rest;
}

/** The workspace a row's "Workspace settings…" opened Settings for, when it isn't the one behind. */
export function settingsWorkspaceFromState(state: unknown): string | undefined {
  return state &&
    typeof state === 'object' &&
    'workspaceId' in state &&
    typeof state.workspaceId === 'string' &&
    state.workspaceId
    ? state.workspaceId
    : undefined;
}

export function arrivedFromSearch(state: unknown): boolean {
  return Boolean(state && typeof state === 'object' && 'fromSearch' in state && state.fromSearch);
}

const SCOPE_ORDER = ['App', 'Workspace', 'Agent'];

/** Visible sections grouped by scope, in App, workspace, agent order. */
export function groupedSettingsSections(sections: ApplicationDestination[], filter = '') {
  const matched = filter.trim() ? matchingSettingsSections(sections, filter) : undefined;
  const listed = sections.filter((item) => !item.host && (!matched || matched.has(item.id)));
  const groups = [...new Set(listed.map((item) => item.group ?? 'App'))].sort(
    (a, b) => SCOPE_ORDER.indexOf(a) - SCOPE_ORDER.indexOf(b),
  );
  return groups.map((group) => ({
    group,
    items: listed.filter((item) => (item.group ?? 'App') === group),
  }));
}
