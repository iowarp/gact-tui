import { describe, expect, it } from 'vitest';
import {
  infrastructureRecovery,
  trackInfrastructureRecovery,
  waitForInfrastructureRecovery,
  type RecoveryProgress,
} from './ssh-recovery-progress';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('saved host check progress', () => {
  it('counts hosts as they finish and lets a waiter follow it to the end', async () => {
    const gate = deferred();
    let advance!: () => void;
    const check = trackInfrastructureRecovery(2, async (next) => {
      advance = next;
      await gate.promise;
    });
    await Promise.resolve();
    expect(infrastructureRecovery()).toEqual({ done: 0, total: 2 });

    const seen: RecoveryProgress[] = [];
    const waiting = waitForInfrastructureRecovery(
      (progress) => seen.push(progress),
      new AbortController().signal,
    );
    advance();
    advance();
    gate.resolve();
    await Promise.all([check, waiting]);

    expect(seen.map((progress) => progress.done)).toEqual([1, 2, 2]);
    expect(infrastructureRecovery()).toBeUndefined();
  });

  it('joins a running check instead of starting a second one', async () => {
    const gate = deferred();
    let runs = 0;
    const first = trackInfrastructureRecovery(1, async () => {
      runs += 1;
      await gate.promise;
    });
    const second = trackInfrastructureRecovery(1, async () => {
      runs += 1;
    });
    gate.resolve();
    await Promise.all([first, second]);
    expect(runs).toBe(1);
  });

  it('returns at once when nothing is being checked, and stops waiting on cancel', async () => {
    await expect(
      waitForInfrastructureRecovery(() => undefined, new AbortController().signal),
    ).resolves.toBeUndefined();

    const gate = deferred();
    const check = trackInfrastructureRecovery(1, () => gate.promise);
    const controller = new AbortController();
    const waiting = waitForInfrastructureRecovery(() => undefined, controller.signal);
    controller.abort(new DOMException('Deployment cancelled', 'AbortError'));
    await expect(waiting).rejects.toThrow('Deployment cancelled');
    gate.resolve();
    await check;
  });
});
