/** Optional session reads share a small queue; log, send and interaction reads bypass it. */
export interface SessionResourceLoading {
  enabled?: boolean;
  load?: <T>(signal: AbortSignal, read: () => Promise<T>) => Promise<T>;
}

/** Run a secondary read through the active session's loading policy when supplied. */
export function loadSessionResource<T>(
  options: SessionResourceLoading,
  signal: AbortSignal,
  read: () => Promise<T>,
): Promise<T> {
  return options.load ? options.load(signal, read) : read();
}

/** Bound simultaneous secondary reads without retaining their results or hiding errors. */
export function createSessionReadQueue(
  concurrency = 2,
): NonNullable<SessionResourceLoading['load']> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('Session read concurrency must be a positive integer');
  }
  let running = 0;
  const queued: Array<() => void> = [];
  const drain = () => {
    while (running < concurrency && queued.length) queued.shift()!();
  };
  return <T>(signal: AbortSignal, read: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason ?? new DOMException('Read cancelled', 'AbortError'));
        return;
      }
      const cancel = () => {
        const index = queued.indexOf(start);
        if (index >= 0) queued.splice(index, 1);
        reject(signal.reason ?? new DOMException('Read cancelled', 'AbortError'));
      };
      const start = () => {
        signal.removeEventListener('abort', cancel);
        if (signal.aborted) {
          reject(signal.reason ?? new DOMException('Read cancelled', 'AbortError'));
          return;
        }
        running += 1;
        Promise.resolve()
          .then(read)
          .then(resolve, reject)
          .finally(() => {
            running -= 1;
            drain();
          });
      };
      signal.addEventListener('abort', cancel, { once: true });
      queued.push(start);
      drain();
    });
}
