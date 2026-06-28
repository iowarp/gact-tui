/**
 * SSE reconnect-backoff scheduler with a live countdown. Exports the
 * {@link LiveConnectionStatus} union and {@link createLiveReconnectScheduler},
 * which walks a backoff ladder and drives the "reconnecting in Ns" signal.
 */
import type { Setter } from 'solid-js';

export type LiveConnectionStatus = 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting';

export interface LiveReconnectScheduler {
  schedule: () => void;
  clear: () => void;
  resetAttempts: () => void;
  reconnectNow: () => void;
}

export function createLiveReconnectScheduler(options: {
  backoffSeconds: readonly number[];
  isDisposed: () => boolean;
  setStatus: Setter<LiveConnectionStatus>;
  setReconnectInSec: Setter<number>;
  onReconnect: () => void;
}): LiveReconnectScheduler {
  let attempt = 0;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function clear() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    options.setReconnectInSec(0);
  }

  function resetAttempts() {
    attempt = 0;
  }

  function schedule() {
    if (options.isDisposed()) return;
    const delay =
      options.backoffSeconds[Math.min(attempt, options.backoffSeconds.length - 1)] ?? 10;
    attempt += 1;
    clear();
    options.setStatus('reconnecting');
    options.setReconnectInSec(delay);
    countdownTimer = setInterval(() => {
      options.setReconnectInSec((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    reconnectTimer = setTimeout(() => {
      clear();
      options.onReconnect();
    }, delay * 1000);
  }

  function reconnectNow() {
    if (options.isDisposed()) return;
    resetAttempts();
    clear();
    options.onReconnect();
  }

  return { schedule, clear, resetAttempts, reconnectNow };
}
