import { STREAM_RECONNECT_MAX_MS } from '@/lib/runtime-limits';

/** Waits out a reconnect backoff, resolving immediately once the stream aborts. */
export function abortableDelay(controller: AbortController, milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    controller.signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

/** Doubles the current backoff, stopping at the configured ceiling. */
export function nextReconnectDelay(current: number): number {
  return Math.min(STREAM_RECONNECT_MAX_MS, current * 2);
}
