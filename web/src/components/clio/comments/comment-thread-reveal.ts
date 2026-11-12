/**
 * A request to show a file's comment threads, made by the transcript chip that opens the
 * file. The comment surface whose threads include one of the ids takes it when it mounts,
 * or, when it was already open and the navigation kept it, once the opening has settled.
 * A view the navigation replaces is gone by then, so it never takes the request.
 */

const REQUEST_TTL_MS = 15_000;
const SETTLE_MS = 300;

interface Request {
  threads: ReadonlySet<string>;
  at: number;
}

let pending: Request | undefined;
const listeners = new Set<() => void>();

/** Ask the surface that holds any of these threads to show its thread list. */
export function revealCommentThreads(threadIds: readonly string[]): void {
  if (!threadIds.length) return;
  const request = { threads: new Set(threadIds), at: Date.now() };
  pending = request;
  setTimeout(() => {
    if (pending !== request) return;
    for (const listener of [...listeners]) listener();
  }, SETTLE_MS);
}

/**
 * Take the pending request when it names one of `threadIds`; `true` once per request.
 * `mountedAt` limits it to requests made before that surface mounted.
 */
export function takeCommentThreadReveal(
  threadIds: Iterable<string>,
  mountedAt?: number,
): boolean {
  if (!pending) return false;
  if (Date.now() - pending.at > REQUEST_TTL_MS) {
    pending = undefined;
    return false;
  }
  if (mountedAt !== undefined && mountedAt < pending.at) return false;
  for (const id of threadIds) {
    if (pending.threads.has(id)) {
      pending = undefined;
      return true;
    }
  }
  return false;
}

/** Hear new requests; returns the unsubscribe. */
export function onCommentThreadReveal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
