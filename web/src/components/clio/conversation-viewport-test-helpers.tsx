import { act, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { TranscriptTestAppearance as AppearanceProvider } from '@/test/transcript-test-appearance';

export function renderConversation(element: ReactElement) {
  return render(
    <AppearanceProvider>
      <ConversationDisplayProvider>{element}</ConversationDisplayProvider>
    </AppearanceProvider>,
  );
}

export function stubViewport(width = 800) {
  const observers: ResizeObserverCallback[] = [];
  const observed = new Set<ResizeObserverCallback>();
  let current = width;
  class ResizeObserverMock implements ResizeObserver {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      observers.push(callback);
    }

    disconnect() {
      observers.splice(observers.indexOf(this.callback), 1);
    }
    observe() {}
    unobserve() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: width,
    height: width,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return {
    /** Deliver each observer's initial observation, at a content-box width. */
    observe(contentWidth: number) {
      act(() => {
        for (const onResize of [...observers]) {
          if (observed.has(onResize)) continue;
          observed.add(onResize);
          onResize(
            [{ contentRect: { width: contentWidth } } as ResizeObserverEntry],
            {} as ResizeObserver,
          );
        }
      });
      current = contentWidth;
    },
    resizeTo(next: number) {
      act(() => {
        for (const onResize of [...observers]) {
          // A browser delivers an initial observation before any later resize.
          if (!observed.has(onResize)) {
            observed.add(onResize);
            onResize(
              [{ contentRect: { width: current } } as ResizeObserverEntry],
              {} as ResizeObserver,
            );
          }
          onResize([{ contentRect: { width: next } } as ResizeObserverEntry], {} as ResizeObserver);
        }
      });
      current = next;
    },
  };
}

export function plainMessages(count: number, withText = true) {
  return Array.from({ length: count }, (_, index) => ({
    id: `message_${index}`,
    session_id: 'session_1',
    role: 'user' as const,
    created_at: '2026-08-22T00:00:00Z',
    blocks: withText
      ? [{ id: `text_${index}`, type: 'text' as const, text: `Message ${index}` }]
      : [],
  }));
}
