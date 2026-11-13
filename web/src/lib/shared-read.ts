interface Flight {
  promise: Promise<unknown>;
  controller: AbortController;
  waiters: number;
}

const flights = new Map<string, Flight>();

function abortError(): DOMException {
  // i18n-ignore: AbortError reason, developer output
  return new DOMException('The operation was aborted', 'AbortError');
}

/**
 * One request in flight per key: callers that ask while it runs share its answer
 * instead of stacking a second identical request. A caller's abort only stops its
 * own wait; the request is aborted once every caller has left.
 */
export function sharedRead<T>(
  key: string,
  read: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  let flight = flights.get(key);
  if (!flight) {
    const controller = new AbortController();
    const started: Flight = {
      controller,
      waiters: 0,
      promise: read(controller.signal).finally(() => {
        if (flights.get(key) === started) flights.delete(key);
      }),
    };
    flights.set(key, started);
    flight = started;
  }
  const shared = flight;
  shared.waiters += 1;
  return new Promise<T>((resolve, reject) => {
    let left = false;
    const leave = () => {
      left = true;
      shared.waiters -= 1;
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (left) return;
      leave();
      reject(abortError());
      if (shared.waiters === 0) {
        if (flights.get(key) === shared) flights.delete(key);
        shared.controller.abort();
      }
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    shared.promise.then(
      (value) => {
        if (left) return;
        leave();
        resolve(value as T);
      },
      (error: unknown) => {
        if (left) return;
        leave();
        reject(error);
      },
    );
  });
}
