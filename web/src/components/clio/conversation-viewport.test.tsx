import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ClioConversation } from './conversation';
import type { Range, VirtualItem, Virtualizer } from '@tanstack/react-virtual';

const virtualizerMocks = vi.hoisted(() => ({
  measure: vi.fn(),
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn(),
  rangeExtractor: undefined as ((range: Range) => number[]) | undefined,
  shouldAdjust: undefined as
    | Virtualizer<HTMLDivElement, Element>['shouldAdjustScrollPositionOnItemSizeChange']
    | undefined,
}));
// Counts turn-model builds without replacing the real projection, so the
// memoization assertion below observes production behaviour.
const turnModelMocks = vi.hoisted(() => ({ presentation: vi.fn() }));

vi.mock('./conversation-turn-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./conversation-turn-model')>();
  return {
    ...actual,
    conversationTurnPresentation: (
      ...args: Parameters<typeof actual.conversationTurnPresentation>
    ) => {
      turnModelMocks.presentation(...args);
      return actual.conversationTurnPresentation(...args);
    },
  };
});

vi.mock('@tanstack/react-virtual', () => ({
  defaultRangeExtractor: () => [],
  useVirtualizer: ({
    count,
    rangeExtractor,
  }: {
    count: number;
    rangeExtractor: (range: Range) => number[];
  }) => {
    virtualizerMocks.rangeExtractor = rangeExtractor;
    return {
      set shouldAdjustScrollPositionOnItemSizeChange(
        callback: Virtualizer<
          HTMLDivElement,
          Element
        >['shouldAdjustScrollPositionOnItemSizeChange'],
      ) {
        virtualizerMocks.shouldAdjust = callback;
      },
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
      measure: virtualizerMocks.measure,
      scrollToIndex: virtualizerMocks.scrollToIndex,
      scrollToOffset: virtualizerMocks.scrollToOffset,
    };
  },
}));

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  virtualizerMocks.measure.mockClear();
  virtualizerMocks.scrollToIndex.mockClear();
  virtualizerMocks.scrollToOffset.mockClear();
  virtualizerMocks.rangeExtractor = undefined;
  virtualizerMocks.shouldAdjust = undefined;
  turnModelMocks.presentation.mockClear();
  window.history.replaceState(null, '', window.location.pathname);
});

function renderConversation(element: ReactElement) {
  return render(
    <AppearanceProvider>
      <ConversationDisplayProvider>{element}</ConversationDisplayProvider>
    </AppearanceProvider>,
  );
}

function stubViewport(width = 800) {
  const observers: ResizeObserverCallback[] = [];
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
    resizeTo(next: number) {
      act(() => {
        for (const onResize of observers)
          onResize([{ contentRect: { width: next } } as ResizeObserverEntry], {} as ResizeObserver);
      });
    },
  };
}

function plainMessages(count: number, withText = true) {
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

describe('ClioConversation transcript viewport', () => {
  it('keeps the explicitly expanded row mounted through a layout scroll and completion', () => {
    stubViewport();
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    const props = { artifacts: {}, subagents: {}, surfaces: {}, tasks: {}, tools: {} };
    const history = plainMessages(79, false);
    const assistant = {
      id: 'selected',
      session_id: 'session_1',
      role: 'assistant' as const,
      created_at: '2026-08-22T00:00:01Z',
      blocks: [
        {
          id: 'reasoning',
          type: 'reasoning' as const,
          text: 'Selected evidence.',
          streaming: true,
        },
      ],
    };
    const view = renderConversation(
      <ClioConversation {...props} messages={[...history, assistant]} />,
    );
    const disclosure = screen.getByRole('button', { name: 'Thinking: Selected evidence.' });
    fireEvent.pointerDown(disclosure);
    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    fireEvent.scroll(screen.getByRole('log', { name: 'Conversation' }));
    // Persisted history can arrive after the live row; its identity stays the
    // same while its index changes from 79 to 99.
    const backfill = plainMessages(20, false).map((message) => ({
      ...message,
      id: `backfilled_${message.id}`,
    }));
    view.rerender(
      <AppearanceProvider>
        <ConversationDisplayProvider>
          <ClioConversation
            {...props}
            messages={[
              ...backfill,
              ...history,
              {
                ...assistant,
                blocks: [{ ...assistant.blocks[0], streaming: false }],
              },
            ]}
          />
        </ConversationDisplayProvider>
      </AppearanceProvider>,
    );
    expect(
      virtualizerMocks.rangeExtractor?.({ startIndex: 0, endIndex: 0, overscan: 0, count: 100 }),
    ).toEqual([99]);
    expect(screen.getByRole('button', { name: 'Reasoning: Selected evidence.' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // A later user scroll deliberately releases the old disclosure's anchor.
    const log = screen.getByRole('log', { name: 'Conversation' });
    fireEvent.wheel(log, { deltaY: -100 });
    fireEvent.scroll(log);
    expect(
      virtualizerMocks.rangeExtractor?.({ startIndex: 0, endIndex: 0, overscan: 0, count: 100 }),
    ).toEqual([0]);
  });
  it('honors keyboard scrolling from a focused transcript button before resizing', () => {
    const viewport = stubViewport();
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={plainMessages(80, false)}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );
    frames.splice(0);
    const log = screen.getByRole('log', { name: 'Conversation' });
    Object.defineProperty(log, 'scrollTop', { configurable: true, writable: true, value: 700 });
    viewport.resizeTo(640);
    // Still engaged when the resize lands, so it follows immediately; the
    // queued frame must not pull the reader back after the key scrolls up.
    scrollTo.mockClear();
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'Copy message' })[0], {
      key: 'ArrowUp',
    });
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Scroll to bottom' })).toBeVisible();
  });
  it('does not follow a queued resize after the reader starts scrolling', () => {
    const viewport = stubViewport();
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={plainMessages(80, false)}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );
    frames.splice(0);
    const log = screen.getByRole('log', { name: 'Conversation' });
    Object.defineProperty(log, 'scrollTop', { configurable: true, writable: true, value: 700 });
    viewport.resizeTo(640);
    scrollTo.mockClear();
    fireEvent.wheel(log, { deltaY: -100 });
    expect(virtualizerMocks.scrollToOffset).toHaveBeenCalledWith(700, { behavior: 'auto' });
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does not re-pin a reader when resize geometry temporarily puts them at the bottom', () => {
    const viewport = stubViewport();
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={plainMessages(80, false)}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );
    const log = screen.getByRole('log', { name: 'Conversation' });
    fireEvent.pointerDown(log);
    Object.defineProperty(log, 'scrollTop', { configurable: true, writable: true, value: 400 });
    fireEvent.scroll(log);
    fireEvent.pointerUp(log);
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 700 });
    fireEvent.scroll(log);
    scrollTo.mockClear();
    viewport.resizeTo(640);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Scroll to bottom' })).toBeVisible();
  });

  it('remeasures transcript rows and restores the pinned view on a width change', () => {
    const viewport = stubViewport();
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });

    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={plainMessages(80, false)}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );
    scrollTo.mockClear();

    viewport.resizeTo(640);

    // Off-screen rows hold the height they had at the old width, so a width
    // change has to re-measure or the transcript jumps on scroll-back.
    expect(virtualizerMocks.measure).toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalled();
  });

  it('keeps the native scrollbar available while the minimap is visible', () => {
    stubViewport(900);
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={plainMessages(1)}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    const log = screen.getByRole('log', { name: 'Conversation' });
    expect(log).toHaveAttribute('data-minimap-visible', 'true');
    expect(log).toHaveClass('clio-scrollbar');
    expect(log.className).not.toContain('scrollbar-width:none');
  });

  it('preserves the visible message offset across a width change', () => {
    const viewport = stubViewport();
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={plainMessages(3)}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );
    const log = screen.getByRole('log', { name: 'Conversation' });
    let displacement = 0;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const top = this.id === 'message-message_0' ? -100 + displacement : 0;
      return {
        top,
        bottom: top + 600,
        width: 800,
        height: 600,
        left: 0,
        right: 800,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    });
    Object.defineProperty(log, 'scrollTop', { configurable: true, writable: true, value: 400 });
    fireEvent.wheel(log, { deltaY: -100 });
    fireEvent.scroll(log);
    displacement = 70;
    viewport.resizeTo(640);
    expect(log.scrollTop).toBe(470);
  });

  it('updates the visible anchor as one navigation gesture settles', () => {
    const viewport = stubViewport();
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    const props = { artifacts: {}, subagents: {}, surfaces: {}, tasks: {}, tools: {} };
    const messages = plainMessages(3);
    renderConversation(<ClioConversation {...props} messages={messages} />);
    const log = screen.getByRole('log', { name: 'Conversation' });
    let firstTop = -100;
    let secondTop = 500;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const top =
        this.id === 'message-message_0'
          ? firstTop
          : this.id === 'message-message_1'
            ? secondTop
            : this.id === 'message-message_2'
              ? 1100
              : 0;
      return {
        top,
        bottom: top + 600,
        width: 800,
        height: 600,
        left: 0,
        right: 800,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    });
    Object.defineProperty(log, 'scrollTop', { configurable: true, writable: true, value: 400 });
    fireEvent.wheel(log, { deltaY: 300 });
    fireEvent.scroll(log);
    // One native navigation can emit several scroll events as its visible
    // range settles. Its first row must not become a permanent selection.
    firstTop = -680;
    secondTop = -80;
    log.scrollTop = 700;
    fireEvent.scroll(log);
    firstTop = -820;
    secondTop = -10;
    viewport.resizeTo(640);
    expect(log.scrollTop).toBe(770);
  });

  it('preserves navigation anchors through layout scrolls before resizing', () => {
    const viewport = stubViewport();
    let viewportWidth = 800;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => viewportWidth);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    let contentHeight = 2000;
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    const props = { artifacts: {}, subagents: {}, surfaces: {}, tasks: {}, tools: {} };
    const messages = plainMessages(3);
    renderConversation(<ClioConversation {...props} messages={messages} />);
    const log = screen.getByRole('log', { name: 'Conversation' });
    Object.defineProperty(log, 'scrollTop', { configurable: true, writable: true, value: 400 });
    let position = 300;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const top = this.id === 'message-message_0' ? position - log.scrollTop : 0;
      return {
        top,
        bottom: top + 600,
        width: 800,
        height: 600,
        left: 0,
        right: 800,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    });
    fireEvent.wheel(log, { deltaY: -100 });
    fireEvent.scroll(log);
    // Wrapped rows change geometry and emit compensation before the width
    // observer runs. That scroll is layout, not a new reading position.
    now = 1000;
    viewportWidth = 640;
    contentHeight = 2100;
    position = 340;
    fireEvent.scroll(log);
    position = 370;
    viewport.resizeTo(640);
    expect(log.scrollTop).toBe(470);
    // A new reader gesture establishes its own position for the next resize.
    fireEvent.wheel(log, { deltaY: 180 });
    log.scrollTop = 700;
    fireEvent.scroll(log);
    position = 440;
    now = 2000;
    viewportWidth = 580;
    contentHeight = 2200;
    fireEvent.scroll(log);
    position = 510;
    viewport.resizeTo(580);
    expect(log.scrollTop).toBe(840);
  });

  it('compensates only measurements before the visible anchor after resizing', () => {
    stubViewport();
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(18000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={plainMessages(80)}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );
    const log = screen.getByRole('log', { name: 'Conversation' });
    Object.defineProperty(log, 'scrollTop', { configurable: true, writable: true, value: 1000 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const index = Number(this.dataset.index ?? -1);
      const top = index < 0 ? 0 : index * 180 - log.scrollTop;
      return {
        top,
        bottom: top + 180,
        height: 180,
        width: 800,
        left: 0,
        right: 800,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    });
    fireEvent.wheel(log, { deltaY: -100 });
    fireEvent.scroll(log);
    const instance = { scrollOffset: 1000 } as Virtualizer<HTMLDivElement, Element>;
    const adjust = (index: number): boolean => {
      const item: VirtualItem = {
        index,
        key: index,
        start: index * 180,
        end: (index + 1) * 180,
        size: 180,
        lane: 0,
      };
      return virtualizerMocks.shouldAdjust?.(item, 26, instance) ?? item.start < 1000;
    };
    expect(adjust(4)).toBe(true);
    expect(adjust(5)).toBe(false);
    expect(adjust(6)).toBe(false);
    // History hydration can move the same durable message to another index.
    document.getElementById('message-message_5')!.dataset.index = '7';
    expect(adjust(6)).toBe(true);
    expect(adjust(7)).toBe(false);
  });

  it('derives the active landmark from the virtualizer without reading rail anchors', () => {
    stubViewport(900);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1_000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);

    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={plainMessages(3)}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    // Fewer messages than the virtualization threshold: the transcript is laid
    // out in flow, and the active index still comes from the virtualizer.
    expect(document.querySelector('[data-scrollspy-anchor]')).toBeNull();

    const log = screen.getByRole('log', { name: 'Conversation' });
    Object.defineProperty(log, 'scrollTop', { configurable: true, value: 400 });
    fireEvent.scroll(log);

    expect(screen.getByRole('button', { name: 'Jump to user message 3' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(screen.getByRole('button', { name: 'Jump to user message 1' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('reserves a floating composer inset without shrinking the transcript viewport', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        bottomInset={176}
        messages={[]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.getByRole('log', { name: 'Conversation' })).toHaveStyle({
      paddingBottom: '176px',
    });
  });

  it('keeps the last message above a composer that grows while following (rel18)', () => {
    const scrollTo = HTMLElement.prototype.scrollTo as ReturnType<typeof vi.fn>;
    const props = {
      artifacts: {},
      messages: plainMessages(2),
      subagents: {},
      surfaces: {},
      tasks: {},
      tools: {},
    };
    const { rerender } = renderConversation(<ClioConversation {...props} bottomInset={167} />);
    const log = screen.getByRole('log', { name: 'Conversation' });
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 1400 });
    scrollTo.mockClear();

    // Session details expanded / a multi-line draft: the floating composer grows.
    rerender(
      <AppearanceProvider>
        <ConversationDisplayProvider>
          <ClioConversation {...props} bottomInset={259} />
        </ConversationDisplayProvider>
      </AppearanceProvider>,
    );

    expect(log).toHaveStyle({ paddingBottom: '259px' });
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'instant', top: 1400 });
  });

  it('focuses an authoritative memory-search result by message id', async () => {
    window.history.replaceState(null, '', '#message-message_1');
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={plainMessages(2)}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    await waitFor(() =>
      expect(virtualizerMocks.scrollToIndex).toHaveBeenCalledWith(1, { align: 'center' }),
    );
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'message-message_1'));
  });

  it('does not rebuild the turn projection when only the activity disclosure changes', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_memo',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [
              { id: 'reason_memo', type: 'reasoning', text: 'Inspecting the evidence.' },
              { id: 'tool_memo', type: 'tool', tool_id: 'tool_read' },
            ],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{
          tool_read: {
            id: 'tool_read',
            session_id: 'session_1',
            name: 'fs_read_file',
            title: 'Read evidence file',
            state: 'succeeded',
          },
        }}
      />,
    );

    const buildsAfterMount = turnModelMocks.presentation.mock.calls.length;
    expect(buildsAfterMount).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /^Activity:/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Activity:/ }));

    expect(turnModelMocks.presentation.mock.calls.length).toBe(buildsAfterMount);
  });
});
