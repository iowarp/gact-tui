import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConversationColumn } from './use-conversation-column';

function Surface({ maxColumnWidth }: { maxColumnWidth: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useConversationColumn(scrollRef, maxColumnWidth);
  return (
    <section data-slot="session-transcript">
      <div ref={scrollRef} />
    </section>
  );
}

describe('useConversationColumn', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('publishes the column edges, including the scrollbar and outline gutter', () => {
    let report: ResizeObserverCallback = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          report = callback;
        }
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    const { container } = render(<Surface maxColumnWidth={896} />);
    const surface = container.querySelector<HTMLElement>('[data-slot="session-transcript"]')!;
    const observe = (outer: number, inner: number, paddingLeft: number) =>
      report(
        [
          {
            borderBoxSize: [{ inlineSize: outer, blockSize: 600 }],
            contentRect: { width: inner, left: paddingLeft },
          } as unknown as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );

    // A wide pane centres the column inside the scroller's content box.
    observe(1386, 1376, 0);
    expect(surface.style.getPropertyValue('--conversation-column-left')).toBe('240px');
    expect(surface.style.getPropertyValue('--conversation-column-right')).toBe('250px');

    // A narrow pane is the scroller's content box: outline gutter left, scrollbar right.
    observe(730, 708, 12);
    expect(surface.style.getPropertyValue('--conversation-column-left')).toBe('12px');
    expect(surface.style.getPropertyValue('--conversation-column-right')).toBe('10px');
  });
});
