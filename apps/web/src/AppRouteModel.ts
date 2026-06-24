/**
 * Pure routing model for the app shell: the `Route` union, `BackendHandle`,
 * and helpers (`initialRouteFromUrl`, `backendHandleFromEntry`,
 * `routeBackToChat`) that decide which screen to show. No DOM/Solid.
 */
import type { Capabilities } from '@clio/core';
import type { BackendRegistry } from './registry.js';
import type { SettingsContext, SettingsSection } from './routes/SettingsShell.js';
import { readSectionParam } from './routes/settings-deeplink.js';
import { synthCapabilities } from './appBootstrap.js';

export interface BackendHandle {
  url: string;
  bearerToken: string;
  capabilities: Capabilities;
}

export type Route =
  | { name: 'splash' }
  | { name: 'connect' }
  | { name: 'chat'; backend: BackendHandle }
  | { name: 'settings'; section?: SettingsSection; context?: SettingsContext }
  | { name: 'add-remote' };

export interface InitialRouteDecision {
  route: Route;
  seedFixtureBackends: boolean;
}

export function initialRouteFromUrl(href: string): InitialRouteDecision {
  const url = parseUrl(href);
  if (!url) return splashRoute();

  const routeParam = url.searchParams.get('route');
  if (routeParam === 'chat') {
    return {
      route: {
        name: 'chat',
        backend: {
          url: url.searchParams.get('backend') ?? 'http://localhost:17800',
          bearerToken: '',
          capabilities: synthCapabilities(),
        },
      },
      seedFixtureBackends: false,
    };
  }
  if (routeParam === 'connect') {
    return { route: { name: 'connect' }, seedFixtureBackends: false };
  }
  if (routeParam === 'settings-backends') {
    return { route: { name: 'settings' }, seedFixtureBackends: true };
  }
  if (routeParam === 'settings') {
    const section = readSectionParam(href);
    return {
      route: {
        name: 'settings',
        ...(section ? { section } : {}),
      },
      seedFixtureBackends: true,
    };
  }
  if (routeParam === 'add-remote') {
    return { route: { name: 'add-remote' }, seedFixtureBackends: true };
  }
  if (routeParam === 'splash') {
    return splashRoute();
  }
  return splashRoute();
}

export function backendHandleFromEntry(cur: {
  url: string;
  bearerToken?: string;
  capabilities?: Capabilities;
}): BackendHandle {
  return {
    url: cur.url,
    bearerToken: cur.bearerToken ?? '',
    capabilities: cur.capabilities ?? synthCapabilities(),
  };
}

export function routeBackToChat(registry: BackendRegistry): Route {
  const cur = registry.current();
  if (!cur) return { name: 'splash' };
  return {
    name: 'chat',
    backend: backendHandleFromEntry(cur),
  };
}

function splashRoute(): InitialRouteDecision {
  return { route: { name: 'splash' }, seedFixtureBackends: false };
}

function parseUrl(href: string): URL | null {
  try {
    return new URL(href, 'http://localhost');
  } catch {
    return null;
  }
}
