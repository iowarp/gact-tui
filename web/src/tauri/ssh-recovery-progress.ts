/**
 * Progress of the desktop's check of its saved SSH hosts (the recorded remote
 * agents), shared between the check itself and anything that must wait for it.
 */

export type RecoveryProgress = { done: number; total: number };

type Recovery = { progress: RecoveryProgress; finished: Promise<void> };

let current: Recovery | undefined;
const listeners = new Set<(progress: RecoveryProgress) => void>();

/** The running check, or undefined when none is running. */
export function infrastructureRecovery(): RecoveryProgress | undefined {
  return current ? { ...current.progress } : undefined;
}

/** Follow the running check's progress; returns the unsubscribe function. */
export function onInfrastructureRecovery(
  listener: (progress: RecoveryProgress) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(progress: RecoveryProgress): void {
  for (const listener of listeners) listener({ ...progress });
}

/**
 * Run one check of `total` hosts. `run` calls `advance` once per host as it
 * finishes. A check already running is joined, not started twice.
 */
export function trackInfrastructureRecovery(
  total: number,
  run: (advance: () => void) => Promise<void>,
): Promise<void> {
  if (current) return current.finished;
  if (total === 0) return Promise.resolve();
  const progress = { done: 0, total };
  const recovery: Recovery = {
    progress,
    finished: Promise.resolve()
      .then(() =>
        run(() => {
          progress.done = Math.min(total, progress.done + 1);
          publish(progress);
        }),
      )
      .finally(() => {
        current = undefined;
        progress.done = total;
        publish(progress);
      }),
  };
  current = recovery;
  publish(progress);
  return recovery.finished;
}

/** Wait for a running check, reporting its progress; returns at once when none runs. */
export async function waitForInfrastructureRecovery(
  onProgress: (progress: RecoveryProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  const recovery = current;
  if (!recovery) return;
  signal.throwIfAborted();
  const stop = onInfrastructureRecovery(onProgress);
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      void recovery.finished
        .catch(() => undefined)
        .then(() => {
          signal.removeEventListener('abort', abort);
          resolve();
        });
    });
  } finally {
    stop();
  }
}
