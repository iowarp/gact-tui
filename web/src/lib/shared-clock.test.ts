import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSharedClock, useSharedNow } from './shared-clock';

describe('useSharedNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.500Z'));
  });
  afterEach(() => {
    resetSharedClock();
    vi.useRealTimers();
  });

  it('runs one timer for every subscriber and ticks them together', () => {
    const renders = { a: 0, b: 0 };
    const a = renderHook(() => {
      renders.a += 1;
      return useSharedNow(true);
    });
    const b = renderHook(() => {
      renders.b += 1;
      return useSharedNow(true);
    });
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(500));
    expect(a.result.current).toBe(Date.parse('2026-01-01T00:00:01.000Z'));
    expect(b.result.current).toBe(a.result.current);
    act(() => vi.advanceTimersByTime(3_000));
    expect(a.result.current).toBe(Date.parse('2026-01-01T00:00:04.000Z'));
    // Four ticks after the initial render, not one per subscriber per tick.
    expect(renders.a).toBeLessThanOrEqual(6);
    a.unmount();
    b.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not schedule anything while not ticking, and freezes when ticking stops', () => {
    const { result, rerender } = renderHook(({ ticking }) => useSharedNow(ticking), {
      initialProps: { ticking: false },
    });
    expect(vi.getTimerCount()).toBe(0);
    const mounted = result.current;
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(mounted);

    rerender({ ticking: true });
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(2_000));
    const running = result.current;
    expect(running).toBeGreaterThan(mounted);

    rerender({ ticking: false });
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBeGreaterThanOrEqual(running);
    expect(result.current).toBeLessThan(running + 1_000);
  });

  it('pauses while the document is hidden and catches up on return', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    const { result } = renderHook(() => useSharedNow(true));
    visibility.mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(10_000));
    const hidden = result.current;
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBeGreaterThan(hidden);
    expect(result.current).toBe(Date.now());
    expect(vi.getTimerCount()).toBe(1);
    visibility.mockRestore();
  });
});
