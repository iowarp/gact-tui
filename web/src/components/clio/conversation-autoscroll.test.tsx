import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ClioConversation } from './conversation';

vi.mock('@tanstack/react-virtual', () => ({
  defaultRangeExtractor: () => [],
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 180,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        end: (index + 1) * 180,
        index,
        key: index,
        size: 180,
        start: index * 180,
      })),
    measureElement: () => undefined,
    measure: () => undefined,
    scrollToIndex: () => undefined,
    scrollToOffset: () => undefined,
  }),
}));

const CLIENT_HEIGHT = 500;

/**
 * A scroll container with real geometry: scrollTop is clamped to the content,
 * content height is controlled by the test (streaming growth), and every
 * ResizeObserver can be fired the way the browser would after layout.
 */
function stubScrollGeometry() {
  let scrollHeight = 2000;
  const tops = new WeakMap<Element, number>();
  const observers = new Set<ResizeObserverCallback>();
  const maxTop = () => Math.max(0, scrollHeight - CLIENT_HEIGHT);
  class ResizeObserverMock implements ResizeObserver {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      observers.add(callback);
    }

    disconnect() {
      observers.delete(this.callback);
    }

    observe() {}
    unobserve() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => scrollHeight);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(CLIENT_HEIGHT);
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return tops.get(this) ?? 0;
    },
    set(this: HTMLElement, value: number) {
      tops.set(this, Math.min(Math.max(0, value), maxTop()));
    },
  });
  const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
    this.scrollTop = options.top ?? this.scrollTop;
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: scrollTo,
  });
  return {
    scrollTo,
    bottom: () => maxTop(),
    /** Content grows by `delta` px; observers fire as they would after layout. */
    grow(delta: number) {
      scrollHeight += delta;
      act(() => {
        for (const callback of observers) callback([], {} as ResizeObserver);
      });
    },
  };
}

function messages(text: string) {
  return [
    {
      id: 'message_user',
      session_id: 'session_1',
      role: 'user' as const,
      created_at: '2026-09-25T00:00:00Z',
      blocks: [{ id: 'text_user', type: 'text' as const, text: 'Explain the result.' }],
    },
    {
      id: 'message_assistant',
      session_id: 'session_1',
      role: 'assistant' as const,
      created_at: '2026-09-25T00:00:01Z',
      blocks: [{ id: 'text_assistant', type: 'text' as const, text, streaming: true }],
    },
  ];
}

function conversation(text: string): ReactElement {
  return (
    <AppearanceProvider>
      <ConversationDisplayProvider>
        <ClioConversation
          artifacts={{}}
          messages={messages(text)}
          subagents={{}}
          surfaces={{}}
          tasks={{}}
          tools={{}}
        />
      </ConversationDisplayProvider>
    </AppearanceProvider>
  );
}

const scrollButton = () => screen.queryByRole('button', { name: 'Scroll to bottom' });

let now = 1_000;
beforeEach(() => {
  now = 1_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { scrollTop?: number }).scrollTop;
});

describe('ClioConversation transcript autoscroll', () => {
  it('stays pinned to the bottom while text streams', () => {
    const geometry = stubScrollGeometry();
    const view = render(conversation('Streaming'));
    const log = screen.getByRole('log', { name: 'Conversation' });
    expect(log.scrollTop).toBe(geometry.bottom());

    geometry.grow(400);
    expect(log.scrollTop).toBe(geometry.bottom());
    view.rerender(conversation('Streaming more text'));
    geometry.grow(300);
    expect(log.scrollTop).toBe(geometry.bottom());
    expect(scrollButton()).toBeNull();
  });

  it('disengages on a user wheel up and shows the scroll-to-bottom button', () => {
    const geometry = stubScrollGeometry();
    render(conversation('Streaming'));
    const log = screen.getByRole('log', { name: 'Conversation' });

    fireEvent.wheel(log, { deltaY: -120 });
    expect(scrollButton()).toBeVisible();
    log.scrollTop = geometry.bottom() - 120;
    fireEvent.scroll(log);
    expect(scrollButton()).toBeVisible();
  });

  it('leaves the view where the reader put it while streaming continues', () => {
    const geometry = stubScrollGeometry();
    const view = render(conversation('Streaming'));
    const log = screen.getByRole('log', { name: 'Conversation' });
    fireEvent.wheel(log, { deltaY: -120 });
    log.scrollTop = 1_000;
    fireEvent.scroll(log);
    geometry.scrollTo.mockClear();

    view.rerender(conversation('Streaming more text'));
    geometry.grow(600);
    now += 5_000;
    view.rerender(conversation('Streaming even more text'));
    geometry.grow(600);

    expect(log.scrollTop).toBe(1_000);
    expect(geometry.scrollTo).not.toHaveBeenCalled();
    expect(scrollButton()).toBeVisible();
  });

  it('re-engages and hides the button when the button is pressed', () => {
    const geometry = stubScrollGeometry();
    const view = render(conversation('Streaming'));
    const log = screen.getByRole('log', { name: 'Conversation' });
    fireEvent.wheel(log, { deltaY: -120 });
    log.scrollTop = 1_000;
    fireEvent.scroll(log);

    fireEvent.click(screen.getByRole('button', { name: 'Scroll to bottom' }));
    expect(geometry.scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      top: 2_000,
    });
    expect(scrollButton()).toBeNull();

    view.rerender(conversation('Streaming more text'));
    geometry.grow(500);
    expect(log.scrollTop).toBe(geometry.bottom());
  });

  it('re-engages and hides the button when the reader scrolls back to the bottom', () => {
    const geometry = stubScrollGeometry();
    const view = render(conversation('Streaming'));
    const log = screen.getByRole('log', { name: 'Conversation' });
    fireEvent.wheel(log, { deltaY: -120 });
    log.scrollTop = 1_000;
    fireEvent.scroll(log);
    expect(scrollButton()).toBeVisible();

    now += 5_000;
    fireEvent.wheel(log, { deltaY: 600 });
    log.scrollTop = geometry.bottom();
    fireEvent.scroll(log);
    expect(scrollButton()).toBeNull();

    view.rerender(conversation('Streaming more text'));
    geometry.grow(500);
    expect(log.scrollTop).toBe(geometry.bottom());
  });

  it('scrolls the transcript when the wheel lands on the button itself', () => {
    const geometry = stubScrollGeometry();
    render(conversation('Streaming'));
    const log = screen.getByRole('log', { name: 'Conversation' });
    fireEvent.wheel(log, { deltaY: -120 });
    log.scrollTop = 1_000;
    fireEvent.scroll(log);

    // The button lives inside the scroller, so native wheel scrolling and the
    // transcript's intent handlers both see a wheel over it.
    const button = screen.getByRole('button', { name: 'Scroll to bottom' });
    expect(log).toContainElement(button);
    now += 5_000;
    fireEvent.wheel(button, { deltaY: 600 });
    log.scrollTop = geometry.bottom();
    fireEvent.scroll(log);
    expect(scrollButton()).toBeNull();
  });

  it('re-engages when the reader drags the scrollbar back to the bottom', () => {
    const geometry = stubScrollGeometry();
    render(conversation('Streaming'));
    const log = screen.getByRole('log', { name: 'Conversation' });

    fireEvent.pointerDown(log);
    log.scrollTop = 900;
    fireEvent.scroll(log);
    expect(scrollButton()).toBeVisible();
    log.scrollTop = geometry.bottom();
    fireEvent.scroll(log);
    fireEvent.pointerUp(log);
    expect(scrollButton()).toBeNull();
  });

  it('does not disengage on resize, measurement, or programmatic scroll', () => {
    const geometry = stubScrollGeometry();
    render(conversation('Streaming'));
    const log = screen.getByRole('log', { name: 'Conversation' });

    // A virtualizer adjustment or a clamp moves scrollTop without user input.
    log.scrollTop = 800;
    fireEvent.scroll(log);
    expect(scrollButton()).toBeNull();
    // The next layout change still follows, because autoscroll stayed engaged.
    geometry.grow(250);
    expect(log.scrollTop).toBe(geometry.bottom());
    expect(scrollButton()).toBeNull();
  });

  it('does not re-engage when a programmatic scroll lands the reader at the bottom', () => {
    const geometry = stubScrollGeometry();
    render(conversation('Streaming'));
    const log = screen.getByRole('log', { name: 'Conversation' });
    fireEvent.wheel(log, { deltaY: -120 });
    log.scrollTop = 1_000;
    fireEvent.scroll(log);

    now += 5_000;
    log.scrollTop = geometry.bottom();
    fireEvent.scroll(log);
    expect(scrollButton()).toBeVisible();
  });

  it('keeps following when the wheel scrolls a nested scroller inside the transcript', () => {
    const geometry = stubScrollGeometry();
    render(conversation('Streaming'));
    const log = screen.getByRole('log', { name: 'Conversation' });
    const nested = document.createElement('pre');
    nested.style.overflowY = 'auto';
    log.querySelector('#message-message_assistant')?.append(nested);
    nested.scrollTop = 200;

    fireEvent.wheel(nested, { deltaY: -120 });
    expect(scrollButton()).toBeNull();
    geometry.grow(300);
    expect(log.scrollTop).toBe(geometry.bottom());
  });
});
