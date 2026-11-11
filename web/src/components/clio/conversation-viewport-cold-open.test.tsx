import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { TranscriptTestAppearance as AppearanceProvider } from '@/test/transcript-test-appearance';
import { ClioConversation } from './conversation';
import {
  renderConversation,
  stubViewport,
  plainMessages,
} from './conversation-viewport-test-helpers';

const virtualizerMocks = vi.hoisted(() => ({
  measure: vi.fn(),
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn(),
}));

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
    scrollToOffset: virtualizerMocks.scrollToOffset,
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
  virtualizerMocks.scrollToOffset.mockClear();
});

const props = { artifacts: {}, subagents: {}, surfaces: {}, tasks: {}, tools: {} };

describe('ClioConversation cold open', () => {
  it('keeps row measurements when the first observation excludes the scrollbar', () => {
    const viewport = stubViewport();
    renderConversation(<ClioConversation {...props} messages={plainMessages(80, false)} />);

    // The border box read on mount includes the scrollbar; the observer's
    // content box does not. Rows were just measured at this width.
    viewport.observe(785);
    expect(virtualizerMocks.measure).not.toHaveBeenCalled();

    viewport.resizeTo(640);
    expect(virtualizerMocks.measure).toHaveBeenCalledOnce();
  });

  it('keeps a paged transcript windowed after its last older page loads', () => {
    stubViewport();
    const earlier = { hasEarlier: true, loading: false, error: undefined, load: vi.fn() };
    const { rerender } = renderConversation(
      <ClioConversation {...props} earlier={earlier} messages={plainMessages(40)} />,
    );
    // A short first page of a long history still opens through the window.
    expect(virtualizerMocks.scrollToIndex).toHaveBeenCalledWith(39, { align: 'end' });
    const column = () => document.querySelector<HTMLElement>('[data-slot="transcript-column"]');
    expect(column()?.style.height).toBe(`${40 * 180}px`);

    rerender(
      <AppearanceProvider>
        <ConversationDisplayProvider>
          <ClioConversation
            {...props}
            earlier={{ ...earlier, hasEarlier: false }}
            messages={plainMessages(60)}
          />
        </ConversationDisplayProvider>
      </AppearanceProvider>,
    );
    expect(column()?.style.height).toBe(`${60 * 180}px`);
  });
});
