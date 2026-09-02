import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ClioConversation } from './conversation';

const virtualizerMocks = vi.hoisted(() => ({ measure: vi.fn(), scrollToIndex: vi.fn() }));
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
    measure: virtualizerMocks.measure,
    scrollToIndex: virtualizerMocks.scrollToIndex,
  }),
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
  let onResize: ResizeObserverCallback | undefined;
  class ResizeObserverMock implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      onResize = callback;
    }

    disconnect() {}
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
        onResize?.([{ contentRect: { width: next } } as ResizeObserverEntry], {} as ResizeObserver);
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

  it('does not rebuild the turn projection when only the view mode changes', () => {
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

    fireEvent.click(screen.getByRole('radio', { name: 'Full activity view' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Chain view' }));

    expect(turnModelMocks.presentation.mock.calls.length).toBe(buildsAfterMount);
  });
});
