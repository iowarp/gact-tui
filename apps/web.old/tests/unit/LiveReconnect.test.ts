import type { Setter } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveReconnectScheduler,
  type LiveConnectionStatus,
} from '../../src/LiveReconnect.js';

function createHarness(options: { disposed?: boolean } = {}) {
  let status: LiveConnectionStatus = 'closed';
  let reconnectInSec = 0;
  let disposed = options.disposed ?? false;
  const reconnect = vi.fn();

  const setStatus = ((next: LiveConnectionStatus) => {
    status = next as LiveConnectionStatus;
    return status;
  }) as Setter<LiveConnectionStatus>;
  const setReconnectInSec = ((next: number | ((prev: number) => number)) => {
    reconnectInSec = typeof next === 'function' ? next(reconnectInSec) : next;
    return reconnectInSec;
  }) as Setter<number>;

  const scheduler = createLiveReconnectScheduler({
    backoffSeconds: [2, 5, 10],
    isDisposed: () => disposed,
    setStatus,
    setReconnectInSec,
    onReconnect: reconnect,
  });

  return {
    scheduler,
    reconnect,
    dispose: () => {
      disposed = true;
    },
    get status() {
      return status;
    },
    get reconnectInSec() {
      return reconnectInSec;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createLiveReconnectScheduler', () => {
  it('counts down and reconnects after the selected backoff delay', () => {
    vi.useFakeTimers();
    const harness = createHarness();

    harness.scheduler.schedule();

    expect(harness.status).toBe('reconnecting');
    expect(harness.reconnectInSec).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(harness.reconnectInSec).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(harness.reconnectInSec).toBe(0);
    expect(harness.reconnect).toHaveBeenCalledTimes(1);
  });

  it('replaces pending reconnect timers when schedule is called again', () => {
    vi.useFakeTimers();
    const harness = createHarness();

    harness.scheduler.schedule();
    vi.advanceTimersByTime(1000);
    expect(harness.reconnectInSec).toBe(1);

    harness.scheduler.schedule();
    expect(harness.reconnectInSec).toBe(5);
    vi.advanceTimersByTime(1000);
    expect(harness.reconnectInSec).toBe(4);
    vi.advanceTimersByTime(3000);
    expect(harness.reconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(harness.reconnect).toHaveBeenCalledTimes(1);
  });

  it('reconnectNow clears pending backoff and resets the attempt ladder', () => {
    vi.useFakeTimers();
    const harness = createHarness();

    harness.scheduler.schedule();
    harness.scheduler.schedule();
    expect(harness.reconnectInSec).toBe(5);

    harness.scheduler.reconnectNow();
    expect(harness.reconnectInSec).toBe(0);
    expect(harness.reconnect).toHaveBeenCalledTimes(1);

    harness.scheduler.schedule();
    expect(harness.reconnectInSec).toBe(2);
  });

  it('does not schedule or reconnect after disposal', () => {
    vi.useFakeTimers();
    const harness = createHarness({ disposed: true });

    harness.scheduler.schedule();
    harness.scheduler.reconnectNow();
    vi.runOnlyPendingTimers();

    expect(harness.status).toBe('closed');
    expect(harness.reconnectInSec).toBe(0);
    expect(harness.reconnect).not.toHaveBeenCalled();
  });
});
