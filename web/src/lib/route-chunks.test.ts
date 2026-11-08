import { afterEach, describe, expect, it, vi } from 'vitest';

const loads = vi.hoisted(() => ({ runs: 0, settings: 0, infrastructure: 0, connection: 0 }));
vi.mock('@/routes/runs-page', () => (loads.runs++, { RunsPage: () => null }));
vi.mock('@/routes/settings-page', () => (loads.settings++, { SettingsPage: () => null }));
vi.mock(
  '@/routes/infrastructure-page',
  () => (loads.infrastructure++, { InfrastructurePage: () => null }),
);
vi.mock('@/routes/connection-page', () => (loads.connection++, { ConnectionPage: () => null }));

import {
  installRoutePrefetch,
  loadedRouteChunk,
  loadRouteChunk,
  routeChunkForPath,
} from './route-chunks';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('route chunks', () => {
  it('maps paths to the lazily loaded routes only', () => {
    expect(routeChunkForPath('/runs')).toBe('runs');
    expect(routeChunkForPath('/settings/general')).toBe('settings');
    expect(routeChunkForPath('/infrastructure')).toBe('infrastructure');
    expect(routeChunkForPath('/infrastructure/models')).toBe('infrastructure');
    expect(routeChunkForPath('/workspaces/w/sessions/s')).toBeUndefined();
    expect(routeChunkForPath('/runsheet')).toBeUndefined();
  });

  it('loads a route module once for the router and every prefetch', async () => {
    const first = loadRouteChunk('connection');
    expect(loadRouteChunk('connection')).toBe(first);
    expect(loadedRouteChunk('connection')).toBeUndefined();
    await first;
    expect(loads.connection).toBe(1);
    expect(loadedRouteChunk('connection')).toBe(await first);
  });

  it('prefetches a route when its link is hovered and the rest once idle', async () => {
    vi.useFakeTimers();
    const uninstall = installRoutePrefetch(document);
    document.body.innerHTML = '<a href="/runs"><span>Runs</span></a>';
    document.querySelector('span')!.dispatchEvent(new Event('pointerover', { bubbles: true }));
    await vi.dynamicImportSettled();
    expect(loads.runs).toBe(1);
    expect(loads.settings).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.dynamicImportSettled();
    expect(loads).toMatchObject({ runs: 1, settings: 1, infrastructure: 1 });
    uninstall();
  });
});
