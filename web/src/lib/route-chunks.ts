import { prefetchDeferredChunks } from './deferred-chunk';

/** Lazily loaded route modules, shared by the router and its prefetcher so each loads once. */
const routeModules = {
  connection: () => import('@/routes/connection-page'),
  runs: () => import('@/routes/runs-page'),
  infrastructure: () => import('@/routes/infrastructure-page'),
  settings: () => import('@/routes/settings-page'),
};

export type RouteChunk = keyof typeof routeModules;
export type RouteModule<Name extends RouteChunk> = Awaited<ReturnType<(typeof routeModules)[Name]>>;

const loading = new Map<RouteChunk, Promise<unknown>>();
const loaded = new Map<RouteChunk, unknown>();

/** A route module that has finished loading, so it can render without suspending. */
export function loadedRouteChunk<Name extends RouteChunk>(
  name: Name,
): RouteModule<Name> | undefined {
  return loaded.get(name) as RouteModule<Name> | undefined;
}

/** Load a route's module once; a failed load is forgotten so the next attempt retries. */
export function loadRouteChunk<Name extends RouteChunk>(name: Name): Promise<RouteModule<Name>> {
  let pending = loading.get(name);
  if (!pending) {
    pending = routeModules[name]().then((module) => {
      loaded.set(name, module);
      return module;
    });
    loading.set(name, pending);
    pending.catch(() => loading.delete(name));
  }
  return pending as Promise<RouteModule<Name>>;
}

/** The lazily loaded route a same-origin path opens, if any. */
export function routeChunkForPath(pathname: string): RouteChunk | undefined {
  if (pathname === '/runs' || pathname.startsWith('/runs/')) return 'runs';
  if (pathname === '/infrastructure' || pathname.startsWith('/infrastructure/'))
    return 'infrastructure';
  if (pathname.startsWith('/settings/')) return 'settings';
  return undefined;
}

/** Delay before idle prefetching, so it never competes with the first screen. Unit: ms. */
const IDLE_PREFETCH_DELAY_MS = 3_000;
const IDLE_PREFETCH: readonly RouteChunk[] = ['runs', 'settings', 'infrastructure'];

/**
 * Warm the secondary routes: when a link to one is hovered, focused or touched,
 * and once the app has been idle for a moment. Their modules are a few hundred
 * KB in all; data is still fetched only on navigation. The idle pass also warms
 * the deferred in-page chunks (math and the science log).
 */
export function installRoutePrefetch(target: Document = document): () => void {
  const prefetchLink = (event: Event) => {
    const anchor =
      event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!anchor || anchor.origin !== target.location.origin) return;
    const chunk = routeChunkForPath(anchor.pathname);
    if (chunk) void loadRouteChunk(chunk).catch(() => undefined);
  };
  const events = ['pointerover', 'focusin', 'touchstart'] as const;
  for (const name of events) target.addEventListener(name, prefetchLink, { passive: true });
  const view = target.defaultView;
  const saveData =
    (view?.navigator as (Navigator & { connection?: { saveData?: boolean } }) | undefined)
      ?.connection?.saveData === true;
  let idle: number | undefined;
  const timer = saveData
    ? undefined
    : view?.setTimeout(() => {
        const prefetch = () => {
          for (const chunk of IDLE_PREFETCH) void loadRouteChunk(chunk).catch(() => undefined);
          prefetchDeferredChunks();
        };
        idle = view.requestIdleCallback
          ? view.requestIdleCallback(prefetch, { timeout: 5_000 })
          : view.setTimeout(prefetch, 0);
      }, IDLE_PREFETCH_DELAY_MS);
  return () => {
    for (const name of events) target.removeEventListener(name, prefetchLink);
    if (timer !== undefined) view?.clearTimeout(timer);
    if (idle !== undefined) {
      if (view?.cancelIdleCallback) view.cancelIdleCallback(idle);
      else view?.clearTimeout(idle);
    }
  };
}
