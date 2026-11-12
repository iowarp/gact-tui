import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  onCommentThreadReveal,
  revealCommentThreads,
  takeCommentThreadReveal,
} from './comment-thread-reveal';

describe('comment thread reveal', () => {
  afterEach(() => {
    takeCommentThreadReveal(['t1']);
    vi.useRealTimers();
  });

  it('goes to the view the opening mounts, not the one it replaces', () => {
    vi.useFakeTimers();
    const mountedBefore = Date.now();
    const replaced = vi.fn(() => takeCommentThreadReveal(['t1']));
    const stop = onCommentThreadReveal(replaced);
    vi.advanceTimersByTime(5);
    revealCommentThreads(['t1']);
    expect(replaced).not.toHaveBeenCalled();
    expect(takeCommentThreadReveal(['t1'], mountedBefore)).toBe(false);
    stop();
    vi.advanceTimersByTime(5);
    expect(takeCommentThreadReveal(['t1'], Date.now())).toBe(true);
    vi.advanceTimersByTime(400);
    expect(replaced).not.toHaveBeenCalled();
  });

  it('reaches a view the opening kept once it has settled', () => {
    vi.useFakeTimers();
    const kept = vi.fn(() => takeCommentThreadReveal(['t1']));
    const stop = onCommentThreadReveal(kept);
    revealCommentThreads(['t1']);
    vi.advanceTimersByTime(299);
    expect(kept).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(kept).toHaveReturnedWith(true);
    stop();
  });
});
