import { expect, it } from 'vitest';
import { createSessionReadQueue } from './session-resource-loading';

it('starts at most two surrounding reads and cancels queued reads without executing them', async () => {
  const load = createSessionReadQueue(2);
  let running = 0;
  let peak = 0;
  const started: number[] = [];
  const release: Array<() => void> = [];
  const task = (id: number, signal: AbortSignal) =>
    load(
      signal,
      () =>
        new Promise<number>((resolve) => {
          running++;
          peak = Math.max(peak, running);
          started.push(id);
          release.push(() => {
            running--;
            resolve(id);
          });
        }),
    );
  const a = task(1, new AbortController().signal);
  const b = task(2, new AbortController().signal);
  const cancelled = new AbortController();
  const c = task(3, cancelled.signal);
  const rejected = expect(c).rejects.toHaveProperty('name', 'AbortError');
  const d = task(4, new AbortController().signal);
  await Promise.resolve();
  expect(started).toEqual([1, 2]);
  cancelled.abort();
  await rejected;
  release.shift()!();
  await a;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(started).toEqual([1, 2, 4]);
  release.splice(0).forEach((finish) => finish());
  await Promise.all([b, d]);
  expect(peak).toBe(2);
});

it('preserves read failures and releases the next slot', async () => {
  const load = createSessionReadQueue(1);
  const signal = new AbortController().signal;
  const bad = load(signal, async () => {
    throw new Error('Read unavailable');
  });
  const good = load(signal, async () => 42);
  await expect(bad).rejects.toThrow('Read unavailable');
  await expect(good).resolves.toBe(42);
});
