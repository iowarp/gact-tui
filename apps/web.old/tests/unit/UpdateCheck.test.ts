import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'solid-js';
import {
  createUpdateCheck,
  fetchMarkerVersion,
  VERSION_MARKER_PATH,
} from '../../src/updateCheck.js';

/** A fetch stub that always resolves to a /version.json body. */
function markerFetch(version: string, ok = true): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify({ version }), {
      status: ok ? 200 : 500,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('updateCheck service', () => {
  it('flips updateAvailable + exposes the new version when the marker differs', async () => {
    await createRoot(async (dispose) => {
      const fetchImpl = markerFetch('vB');
      const handle = createUpdateCheck({
        currentVersion: 'vA',
        fetchImpl,
        autoStart: false,
      });

      expect(handle.updateAvailable()).toBe(false);
      expect(handle.newVersion()).toBeNull();

      await handle.checkNow();

      expect(handle.updateAvailable()).toBe(true);
      expect(handle.newVersion()).toBe('vB');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      // Cache-busting query is present.
      const calledUrl = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0]?.[0] as string;
      expect(calledUrl).toContain(VERSION_MARKER_PATH);
      expect(calledUrl).toMatch(/\?t=\d+/);

      handle.stop();
      dispose();
    });
  });

  it('does not flip when the served version matches the running build', async () => {
    await createRoot(async (dispose) => {
      const fetchImpl = markerFetch('vA');
      const handle = createUpdateCheck({
        currentVersion: 'vA',
        fetchImpl,
        autoStart: false,
      });

      await handle.checkNow();

      expect(handle.updateAvailable()).toBe(false);
      expect(handle.newVersion()).toBeNull();

      handle.stop();
      dispose();
    });
  });

  it('never checks when the running build is "dev"', async () => {
    await createRoot(async (dispose) => {
      const fetchImpl = markerFetch('vB');
      const handle = createUpdateCheck({
        currentVersion: 'dev',
        fetchImpl,
        autoStart: false,
      });

      await handle.checkNow();

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(handle.updateAvailable()).toBe(false);

      handle.stop();
      dispose();
    });
  });

  it('tolerates fetch failure silently (offline)', async () => {
    await createRoot(async (dispose) => {
      const fetchImpl = vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch;
      const handle = createUpdateCheck({
        currentVersion: 'vA',
        fetchImpl,
        autoStart: false,
      });

      await expect(handle.checkNow()).resolves.toBeUndefined();
      expect(handle.updateAvailable()).toBe(false);

      handle.stop();
      dispose();
    });
  });

  it('ignores a non-ok marker response', async () => {
    const fetchImpl = markerFetch('vB', /* ok */ false);
    expect(await fetchMarkerVersion(fetchImpl, '/version.json')).toBeNull();
  });

  it('stops polling once an update has been observed', async () => {
    await createRoot(async (dispose) => {
      const fetchImpl = markerFetch('vB');
      const handle = createUpdateCheck({
        currentVersion: 'vA',
        fetchImpl,
        autoStart: false,
      });

      await handle.checkNow();
      expect(handle.updateAvailable()).toBe(true);
      const callsAfterFirst = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock
        .calls.length;

      // A second check is a no-op now that the answer is known.
      await handle.checkNow();
      expect(
        (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls.length,
      ).toBe(callsAfterFirst);

      handle.stop();
      dispose();
    });
  });
});
