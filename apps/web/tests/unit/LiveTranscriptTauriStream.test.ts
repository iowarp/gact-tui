import { describe, expect, it, vi } from 'vitest';
import type { SseBridgeHandle, SseBridgeHandlers } from '../../src/tauri.js';
import { openLiveTranscriptTauriStream } from '../../src/LiveTranscriptTauriStream.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createHarness(options: { stale?: boolean; lastEventId?: string } = {}) {
  const bridgeOpen = deferred<SseBridgeHandle>();
  let handlers: SseBridgeHandlers | null = null;
  let stale = options.stale ?? false;
  let handle: SseBridgeHandle | null = null;
  const close = vi.fn();
  const onOpen = vi.fn();
  const onData = vi.fn();
  const onFailure = vi.fn();
  const openBridge = vi.fn(
    (_: string, nextHandlers: SseBridgeHandlers, _lastEventId?: string) => {
      handlers = nextHandlers;
      return bridgeOpen.promise;
    },
  );

  openLiveTranscriptTauriStream({
    sseUrl: '/events',
    generation: 4,
    lastEventId: options.lastEventId,
    isStale: (generation) => stale || generation !== 4,
    setHandle: (next) => {
      handle = next;
    },
    onOpen,
    onData,
    onFailure,
    openBridge,
  });

  return {
    bridgeOpen,
    close,
    get handle() {
      return handle;
    },
    get handlers() {
      if (!handlers) throw new Error('bridge handlers were not registered');
      return handlers;
    },
    markStale: () => {
      stale = true;
    },
    onData,
    onFailure,
    onOpen,
    openBridge,
  };
}

describe('openLiveTranscriptTauriStream', () => {
  it('opens the bridge and forwards open/data (with id) callbacks while fresh', async () => {
    const harness = createHarness();
    const handle = { close: harness.close };

    expect(harness.openBridge).toHaveBeenCalledWith('/events', expect.any(Object), undefined);
    harness.handlers.onOpen();
    harness.handlers.onData('payload', 'id-9');
    harness.bridgeOpen.resolve(handle);
    await harness.bridgeOpen.promise;

    expect(harness.onOpen).toHaveBeenCalledTimes(1);
    expect(harness.onData).toHaveBeenCalledWith('payload', 'id-9');
    expect(harness.handle).toBe(handle);
    expect(harness.close).not.toHaveBeenCalled();
  });

  it('forwards lastEventId to the bridge for Last-Event-ID resume', () => {
    const harness = createHarness({ lastEventId: '42' });
    expect(harness.openBridge).toHaveBeenCalledWith('/events', expect.any(Object), '42');
  });

  it('deduplicates bridge errors and clears the active handle', () => {
    const harness = createHarness();

    harness.handlers.onError('socket died');
    harness.handlers.onClosed();

    expect(harness.handle).toBeNull();
    expect(harness.onFailure).toHaveBeenCalledTimes(1);
  });

  it('ignores callbacks and closes a late handle when stale', async () => {
    const harness = createHarness({ stale: true });
    const handle = { close: harness.close };

    harness.handlers.onOpen();
    harness.handlers.onData('late');
    harness.handlers.onError('late error');
    harness.bridgeOpen.resolve(handle);
    await harness.bridgeOpen.promise;

    expect(harness.onOpen).not.toHaveBeenCalled();
    expect(harness.onData).not.toHaveBeenCalled();
    expect(harness.onFailure).not.toHaveBeenCalled();
    expect(harness.handle).toBeNull();
    expect(harness.close).toHaveBeenCalledTimes(1);
  });

  it('closes a bridge handle that resolves after failure', async () => {
    const harness = createHarness();
    const handle = { close: harness.close };

    harness.handlers.onClosed();
    harness.bridgeOpen.resolve(handle);
    await harness.bridgeOpen.promise;

    expect(harness.onFailure).toHaveBeenCalledTimes(1);
    expect(harness.handle).toBeNull();
    expect(harness.close).toHaveBeenCalledTimes(1);
  });

  it('treats bridge open rejection as a failure only while fresh', async () => {
    const fresh = createHarness();
    fresh.bridgeOpen.reject(new Error('boom'));
    await expect(fresh.bridgeOpen.promise).rejects.toThrow('boom');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fresh.onFailure).toHaveBeenCalledTimes(1);

    const stale = createHarness({ stale: true });
    stale.bridgeOpen.reject(new Error('late boom'));
    await expect(stale.bridgeOpen.promise).rejects.toThrow('late boom');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stale.onFailure).not.toHaveBeenCalled();
  });
});
