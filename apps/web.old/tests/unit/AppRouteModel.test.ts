import { describe, expect, it } from 'vitest';
import { InMemoryPersistence } from '@clio/core';
import { createRoot } from 'solid-js';
import {
  backendHandleFromEntry,
  initialRouteFromUrl,
  routeBackToChat,
} from '../../src/AppRouteModel.js';
import { createBackendRegistry } from '../../src/registry.js';
import type { BackendRegistry } from '../../src/registry.js';

describe('AppRouteModel', () => {
  it('defaults to splash without fixture seeding', () => {
    const decision = initialRouteFromUrl('http://localhost/');

    expect(decision.route).toEqual({ name: 'splash' });
    expect(decision.seedFixtureBackends).toBe(false);
  });

  it('builds the visual chat route from query params', () => {
    const decision = initialRouteFromUrl(
      'http://localhost/?route=chat&backend=http%3A%2F%2F127.0.0.1%3A18000',
    );

    expect(decision.route.name).toBe('chat');
    if (decision.route.name !== 'chat') throw new Error('expected chat route');
    expect(decision.route.backend.url).toBe('http://127.0.0.1:18000');
    expect(decision.route.backend.bearerToken).toBe('');
    expect(decision.route.backend.capabilities.capabilities.sessions).toBe(true);
    expect(decision.seedFixtureBackends).toBe(false);
  });

  it('preserves settings deep links and requests fixture backends', () => {
    const decision = initialRouteFromUrl(
      'http://localhost/?route=settings&section=providers',
    );

    expect(decision.route).toEqual({ name: 'settings', section: 'providers' });
    expect(decision.seedFixtureBackends).toBe(true);
  });

  it('requests fixture backends for add-remote screenshots', () => {
    const decision = initialRouteFromUrl('http://localhost/?route=add-remote');

    expect(decision.route).toEqual({ name: 'add-remote' });
    expect(decision.seedFixtureBackends).toBe(true);
  });

  it('fills missing backend fields from defaults', () => {
    const handle = backendHandleFromEntry({ url: 'http://x.test' });

    expect(handle.url).toBe('http://x.test');
    expect(handle.bearerToken).toBe('');
    expect(handle.capabilities.backend.name).toBe('fixture');
  });

  it('routes back to splash when no backend is selected', () => {
    withRegistry((registry) => {
      expect(routeBackToChat(registry)).toEqual({ name: 'splash' });
    });
  });

  it('routes back to the selected backend', () => {
    withRegistry((registry) => {
      registry.add({
        id: 'local',
        label: 'Local',
        url: 'http://127.0.0.1:17800',
        bearerToken: 'tok',
        kind: 'http',
      });
      registry.select('local');

      const route = routeBackToChat(registry);
      expect(route.name).toBe('chat');
      if (route.name !== 'chat') throw new Error('expected chat route');
      expect(route.backend.url).toBe('http://127.0.0.1:17800');
      expect(route.backend.bearerToken).toBe('tok');
    });
  });
});

function withRegistry(test: (registry: BackendRegistry) => void) {
  createRoot((dispose) => {
    try {
      const registry = createBackendRegistry({
        persistence: new InMemoryPersistence({ backends: [], currentId: null }),
      });
      test(registry);
    } finally {
      dispose();
    }
  });
}
