import { describe, expect, it, vi } from 'vitest';
import { FrameBatcher, type FrameClock } from './frame-batcher';

class ControlledFrameClock implements FrameClock {
  private nextHandle = 1;
  private callbacks = new Map<number, FrameRequestCallback>();

  request(callback: FrameRequestCallback): number {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }

  tick(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback(performance.now()));
  }
}

describe('FrameBatcher', () => {
  it('commits a high-rate burst once on the next display frame', () => {
    const clock = new ControlledFrameClock();
    const commit = vi.fn<(items: readonly number[]) => void>();
    const batcher = new FrameBatcher(commit, clock);

    for (let index = 0; index < 100; index += 1) batcher.push(index);

    expect(commit).not.toHaveBeenCalled();
    clock.tick();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]?.[0]).toHaveLength(100);
  });

  it('flushes authoritative queued data immediately on completion', () => {
    const clock = new ControlledFrameClock();
    const committed: string[][] = [];
    const batcher = new FrameBatcher<string>((items) => committed.push([...items]), clock);

    batcher.push('received ');
    batcher.push('text');
    batcher.stop({ flush: true });
    clock.tick();

    expect(committed).toEqual([['received ', 'text']]);
  });

  it('bounds a sustained high-rate stream to one commit per display frame', () => {
    const clock = new ControlledFrameClock();
    const committed: number[][] = [];
    const batcher = new FrameBatcher<number>((items) => committed.push([...items]), clock);

    for (let frame = 0; frame < 60; frame += 1) {
      for (let delta = 0; delta < 100; delta += 1) batcher.push(frame * 100 + delta);
      clock.tick();
    }

    expect(committed).toHaveLength(60);
    expect(committed.every((items) => items.length === 100)).toBe(true);
    expect(committed.flat()).toHaveLength(6_000);
  });

  it('discards queued work when cancellation requests no completion flush', () => {
    const clock = new ControlledFrameClock();
    const commit = vi.fn<(items: readonly string[]) => void>();
    const batcher = new FrameBatcher(commit, clock);

    batcher.push('partial response');
    batcher.stop({ flush: false });
    clock.tick();

    expect(commit).not.toHaveBeenCalled();
  });
});
