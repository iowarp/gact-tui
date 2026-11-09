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
  // A real observer reports each target's size once after it starts
  // observing; the transcript waits for that first entry instead of forcing
  // a layout read while it mounts.
  const unreported = new Set<ResizeObserverCallback>();
  class ResizeObserverMock implements ResizeObserver {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      observers.push(callback);
    }

    disconnect() {
      observers.splice(observers.indexOf(this.callback), 1);
      unreported.delete(this.callback);
    }
    observe() {
      unreported.add(this.callback);
    }
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
  const report = (callbacks: Iterable<ResizeObserverCallback>, next: number) => {
    for (const onResize of [...callbacks])
      onResize([{ contentRect: { width: next } } as ResizeObserverEntry], {} as ResizeObserver);
  };
  const reportInitial = () => {
    const pending = [...unreported];
    unreported.clear();
    report(pending, width);
  };
  return {
    /** Deliver the first observation for every target observed so far. */
    settle() {
      act(reportInitial);
    },
    resizeTo(next: number) {
      act(() => {
        reportInitial();
        report(observers, next);
      });
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
