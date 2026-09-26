import type { Virtualizer } from '@tanstack/react-virtual';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from 'react';

export interface TranscriptReadingAnchor {
  id: string;
  index: number;
  offset: number;
}

interface ReadingPositionOptions {
  messageCount: number;
  setActiveMessageIndex: Dispatch<SetStateAction<number>>;
  scrollRef: RefObject<HTMLDivElement | null>;
  pinnedToBottomRef: RefObject<boolean>;
  readingAnchorRef: RefObject<TranscriptReadingAnchor | null>;
  virtualized: boolean;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  virtualRangeKey: string;
}

/** Preserve explicit reader intent across native scrolling and virtualized measurement. */
export function useTranscriptReadingPosition({
  messageCount,
  setActiveMessageIndex,
  scrollRef,
  pinnedToBottomRef,
  readingAnchorRef,
  virtualized,
  virtualizer,
  virtualRangeKey,
}: ReadingPositionOptions) {
  useLayoutEffect(() => {
    // In-flow rows use browser layout plus our reading anchor. Letting the
    // virtualizer also compensate their measured heights double-scrolls them.
    // oxlint-disable-next-line react/immutability -- TanStack exposes this imperative configuration property on its stable instance.
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = virtualized ? undefined : () => false;
  }, [virtualized, virtualizer]);
  const scrollIntentVersionRef = useRef(0);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (pinnedToBottomRef.current) {
      const latestIndex = messageCount - 1;
      setActiveMessageIndex((current) => (current === latestIndex ? current : latestIndex));
      return;
    }
    // The virtualizer measures all mounted rows, including the in-flow layout;
    // the minimap must not infer position from its own incomplete DOM landmarks.
    const firstVisible = virtualizer
      .getVirtualItems()
      .find((item) => item.end >= element.scrollTop);
    if (firstVisible)
      setActiveMessageIndex((current) =>
        current === firstVisible.index ? current : firstVisible.index,
      );
  }, [
    messageCount,
    virtualizer,
    virtualRangeKey,
    scrollRef,
    pinnedToBottomRef,
    setActiveMessageIndex,
  ]);
  const captureReadingAnchor = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const viewportTop = element.getBoundingClientRect().top;
    const row = Array.from(
      element.querySelectorAll<HTMLElement>('[data-index][id^="message-"]'),
    ).find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.bottom > viewportTop && rect.top < viewportTop + element.clientHeight;
    });
    readingAnchorRef.current = row
      ? {
          id: row.id,
          index: Number(row.dataset.index),
          offset: row.getBoundingClientRect().top - viewportTop,
        }
      : null;
  }, [scrollRef, readingAnchorRef]);

  useLayoutEffect(() => {
    // A native scroll event can arrive before virtualization has mounted its
    // new range. Never anchor an off-screen overscan row from the old range.
    if (!pinnedToBottomRef.current && !readingAnchorRef.current) captureReadingAnchor();
  }, [virtualRangeKey, captureReadingAnchor, pinnedToBottomRef, readingAnchorRef]);

  /**
   * Record explicit reader navigation. It invalidates a queued resize anchor
   * restore and the virtualizer's pending index target; autoscroll engagement
   * is owned by `useTranscriptAutoscroll`, not by this intent.
   */
  const markUserScrollIntent = useCallback(() => {
    scrollIntentVersionRef.current += 1;
    readingAnchorRef.current = null;
    // TanStack reconciles scrollToIndex while row sizes settle. Replace that
    // old index target with the current offset before the browser applies the
    // user's input, otherwise its later measurements can resurrect the jump.
    if (virtualized && scrollRef.current) {
      virtualizer.scrollToOffset(scrollRef.current.scrollTop, { behavior: 'auto' });
    }
  }, [virtualized, virtualizer, scrollRef, readingAnchorRef]);

  return {
    scrollIntentVersionRef,
    captureReadingAnchor,
    markUserScrollIntent,
  };
}

interface TranscriptWidthOptions {
  virtualized: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  pinnedToBottomRef: RefObject<boolean>;
  readingAnchorRef: RefObject<TranscriptReadingAnchor | null>;
  scrollIntentVersionRef: RefObject<number>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  scrollToBottom: (behavior: ScrollBehavior) => void;
}

/** Remeasure wrapped rows while preserving the reader's visible anchor. */
export function useTranscriptWidth({
  virtualized,
  scrollRef,
  pinnedToBottomRef,
  readingAnchorRef,
  scrollIntentVersionRef,
  virtualizer,
  scrollToBottom,
}: TranscriptWidthOptions): number {
  const [conversationViewportWidth, setConversationViewportWidth] = useState(0);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let width = Math.round(element.getBoundingClientRect().width);
    setConversationViewportWidth(width);
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.round(entry?.contentRect.width ?? 0);
      if (!nextWidth || nextWidth === width) return;
      width = nextWidth;
      setConversationViewportWidth(nextWidth);
      const resizeAnchor = readingAnchorRef.current;
      const intentVersion = scrollIntentVersionRef.current;
      // Only mounted rows carry a live ResizeObserver, so every off-screen row
      // still holds the height it had at the previous width. Keeping those
      // stale heights makes the transcript jump when the reader scrolls back
      // up; re-estimating and re-measuring costs a frame and stays honest.
      if (virtualized) virtualizer.measure();
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        // Re-check intent at execution time; the user may have scrolled since
        // this resize was queued. Geometry alone never enables following.
        if (pinnedToBottomRef.current) scrollToBottom('instant');
        else if (intentVersion === scrollIntentVersionRef.current) {
          const anchor = resizeAnchor;
          const row = anchor ? document.getElementById(anchor.id) : null;
          if (row && anchor)
            element.scrollTop +=
              row.getBoundingClientRect().top - element.getBoundingClientRect().top - anchor.offset;
        }
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [
    scrollRef,
    pinnedToBottomRef,
    readingAnchorRef,
    scrollIntentVersionRef,
    scrollToBottom,
    virtualizer,
    virtualized,
  ]);

  return conversationViewportWidth;
}
