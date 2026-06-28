import type { Setter } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installLiveTranscriptConnectionListeners,
} from '../../src/LiveTranscriptConnectionListeners.js';
import type { LiveConnectionStatus } from '../../src/LiveReconnect.js';

function createHarness() {
  let disposed = false;
  let status: LiveConnectionStatus = 'closed';
  const teardown = vi.fn();
  const scheduleReconnect = vi.fn();
  const reconnectNow = vi.fn();
  const onFocus = vi.fn();
  const setStatus = ((next: LiveConnectionStatus) => {
    status = next;
    return status;
  }) as Setter<LiveConnectionStatus>;
  const cleanup = installLiveTranscriptConnectionListeners({
    isDisposed: () => disposed,
    teardown,
    setStatus,
    scheduleReconnect,
    reconnectNow,
    onFocus,
  });
  return {
    cleanup,
    dispose: () => {
      disposed = true;
    },
    teardown,
    scheduleReconnect,
    reconnectNow,
    onFocus,
    get status() {
      return status;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installLiveTranscriptConnectionListeners', () => {
  it('tears down and schedules reconnect on offline', () => {
    const harness = createHarness();

    window.dispatchEvent(new Event('offline'));

    expect(harness.teardown).toHaveBeenCalledTimes(1);
    expect(harness.status).toBe('error');
    expect(harness.scheduleReconnect).toHaveBeenCalledTimes(1);
    harness.cleanup();
  });

  it('reconnects immediately on online', () => {
    const harness = createHarness();

    window.dispatchEvent(new Event('online'));

    expect(harness.reconnectNow).toHaveBeenCalledTimes(1);
    harness.cleanup();
  });

  it('refetches on focus and visible-tab changes', () => {
    const harness = createHarness();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(harness.onFocus).toHaveBeenCalledTimes(2);
    harness.cleanup();
  });

  it('ignores lifecycle events after disposal or cleanup', () => {
    const harness = createHarness();

    harness.dispose();
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('focus'));
    expect(harness.teardown).not.toHaveBeenCalled();
    expect(harness.onFocus).not.toHaveBeenCalled();

    harness.cleanup();
    window.dispatchEvent(new Event('online'));
    expect(harness.reconnectNow).not.toHaveBeenCalled();
  });
});
