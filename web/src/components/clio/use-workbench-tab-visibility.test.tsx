import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWorkbenchTabVisibility } from './use-workbench-tab-visibility';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('reveals both edges after container resize, label resize, reorder and portal remount', () => {
  const callbacks: ResizeObserverCallback[] = [];
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const geometry = { width: 400, start: 270, tabWidth: 120 };
  let strip: HTMLDivElement;
  function Harness({ maximized = false, tabs = [{ id: 'selected', label: 'Report' }] }) {
    const stripRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef<HTMLDivElement>(null);
    useWorkbenchTabVisibility(stripRef, activeRef, 'selected', tabs, maximized);
    return (
      <div
        key={String(maximized)}
        ref={(node) => {
          stripRef.current = node;
          if (!node) return;
          strip = node;
          Object.defineProperty(node, 'clientWidth', {
            configurable: true,
            get: () => geometry.width,
          });
          node.getBoundingClientRect = () =>
            ({ left: 560, width: geometry.width, right: 560 + geometry.width }) as DOMRect;
        }}
      >
        <div>
          <div
            ref={(node) => {
              activeRef.current = node;
              if (node)
                node.getBoundingClientRect = () =>
                  ({
                    left: 560 + geometry.start - strip.scrollLeft,
                    right: 560 + geometry.start + geometry.tabWidth - strip.scrollLeft,
                    width: geometry.tabWidth,
                  }) as DOMRect;
            }}
          >
            Selected
          </div>
        </div>
      </div>
    );
  }
  const { rerender } = render(<Harness />);
  expect(strip!.scrollLeft).toBe(0);
  geometry.width = 250;
  act(() => callbacks.at(-1)!([], {} as ResizeObserver));
  expect(strip!.scrollLeft).toBe(140);
  geometry.tabWidth = 160;
  act(() => callbacks.at(-1)!([], {} as ResizeObserver));
  expect(strip!.scrollLeft).toBe(180);
  geometry.start = 30;
  rerender(<Harness tabs={[{ id: 'selected', label: 'Renamed report' }]} />);
  expect(strip!.scrollLeft).toBe(30);
  geometry.start = 270;
  rerender(<Harness maximized />);
  expect(strip!.scrollLeft).toBe(180);
  expect(disconnect).toHaveBeenCalledTimes(2);
});
