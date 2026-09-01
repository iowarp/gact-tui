export const INITIAL_RECONNECT_DELAY_MS = 250;
export const MAX_RECONNECT_DELAY_MS = 8_000;

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

export function nextReconnectDelay(current: number): number {
  return Math.min(MAX_RECONNECT_DELAY_MS, current * 2);
}
