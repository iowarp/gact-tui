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
  disclosure: boolean;
  viewportWidth: number;
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
    // In-flow rows use browser layout plus our reading anchor. For virtualized
    // rows, compensate only changes before that row: changing the partially
    // visible anchor's own height must not move its top after width restoration.
    // oxlint-disable-next-line react/immutability -- TanStack exposes this imperative configuration property on its stable instance.
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = virtualized
      ? (item, _delta, instance) => {
          const anchor = readingAnchorRef.current;
          if (!anchor) return item.start < (instance.scrollOffset ?? 0);
          const row = document.getElementById(anchor.id);
          const index = row ? Number(row.dataset.index) : anchor.index;
          return item.index < index;
        }
      : () => false;
  }, [virtualized, virtualizer, readingAnchorRef]);
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
  const captureReadingAnchor = useCallback(
    (target?: Element | null) => {
      const element = scrollRef.current;
      if (!element) return;
      const current = readingAnchorRef.current;
      // Row observers can scroll before the viewport's resize observer runs.
      // Keep the stable old-width anchor until its restoration completes.
      if (current && current.viewportWidth !== element.clientWidth) return;
      const viewportTop = element.getBoundingClientRect().top;
      const selected = target?.closest<HTMLElement>('[data-index][id^="message-"]');
      const row =
        selected && element.contains(selected)
          ? selected
          : Array.from(element.querySelectorAll<HTMLElement>('[data-index][id^="message-"]')).find(
              (item) => {
                const rect = item.getBoundingClientRect();
                return rect.bottom > viewportTop && rect.top < viewportTop + element.clientHeight;
              },
            );
      readingAnchorRef.current = row
        ? {
            id: row.id,
            index: Number(row.dataset.index),
            offset: row.getBoundingClientRect().top - viewportTop,
            disclosure: row === selected,
            viewportWidth: element.clientWidth,
          }
        : null;
    },
    [scrollRef, readingAnchorRef],
  );

  useLayoutEffect(() => {
    // Measurement can settle after the last native scroll. Refresh ordinary
    // reading positions at the same width, preserving explicit disclosures.
    if (!pinnedToBottomRef.current && !readingAnchorRef.current?.disclosure) captureReadingAnchor();
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
      let settledFrames = 0;
      let remainingFrames = 30;
      const restore = () => {
        // Re-check intent at execution time; the user may have scrolled since
        // this resize was queued. Geometry alone never enables following.
        if (pinnedToBottomRef.current) {
          scrollToBottom('instant');
          return;
        }
        if (intentVersion !== scrollIntentVersionRef.current || !resizeAnchor) return;
        const row = document.getElementById(resizeAnchor.id);
        const delta = row
          ? row.getBoundingClientRect().top -
            element.getBoundingClientRect().top -
            resizeAnchor.offset
          : Number.POSITIVE_INFINITY;
        if (Number.isFinite(delta) && Math.abs(delta) > 0.5) element.scrollTop += delta;
        if (row && Number.isFinite(delta))
          readingAnchorRef.current = { ...resizeAnchor, viewportWidth: element.clientWidth };
        settledFrames = Math.abs(delta) <= 0.5 ? settledFrames + 1 : 0;
        // A batched virtualizer commit may remount or reposition the anchor
        // after the first frame. Stop after three settled frames, with a cap
        // for an anchor the viewport cannot reach.
        if (--remainingFrames > 0 && settledFrames < 3)
          frame = window.requestAnimationFrame(restore);
      };
      frame = window.requestAnimationFrame(restore);
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
