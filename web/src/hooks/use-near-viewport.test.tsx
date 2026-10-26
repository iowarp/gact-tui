import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useNearViewport } from './use-near-viewport';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('prepares nearby content and releases its observer on unmount', () => {
  let notify!: IntersectionObserverCallback;
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      disconnect = disconnect;
      observe = observe;
    },
  );
  const ref = { current: document.createElement('div') };
  const view = renderHook(() => useNearViewport(ref));
  expect(view.result.current).toBe(false);
  expect(observe).toHaveBeenCalledWith(ref.current);
  act(() =>
    notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
  );
  expect(view.result.current).toBe(true);
  act(() =>
    notify([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver),
  );
  expect(view.result.current).toBe(false);
  view.unmount();
  expect(disconnect).toHaveBeenCalledTimes(1);
});
