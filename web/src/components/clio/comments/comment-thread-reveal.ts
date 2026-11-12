/**
 * A request to show a file's comment threads, made by the transcript chip that opens the
 * file. The comment surface whose threads include one of the ids takes it when it mounts,
 * or at once when it is already open, and shows its thread list.
 */

const REQUEST_TTL_MS = 15_000;

interface Request {
  threads: ReadonlySet<string>;
  at: number;
}

let pending: Request | undefined;
const listeners = new Set<() => void>();

/** Ask the surface that holds any of these threads to show its thread list. */
export function revealCommentThreads(threadIds: readonly string[]): void {
  if (!threadIds.length) return;
  pending = { threads: new Set(threadIds), at: Date.now() };
  for (const listener of listeners) listener();
}

/** Take the pending request when it names one of `threadIds`; `true` once per request. */
export function takeCommentThreadReveal(threadIds: Iterable<string>): boolean {
  if (!pending) return false;
  if (Date.now() - pending.at > REQUEST_TTL_MS) {
    pending = undefined;
    return false;
  }
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
