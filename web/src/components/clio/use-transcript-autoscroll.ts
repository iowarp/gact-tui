import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  type TouchEvent,
  type WheelEvent,
} from 'react';

/**
 * Distance from the bottom, in CSS pixels, still treated as "at the bottom".
 * It only absorbs sub-pixel rounding of a fractional scrollTop; any real
 * movement away from the bottom is larger than this.
 */
const BOTTOM_EPSILON_PX = 2;

/**
 * How long after a wheel, key, or touch input the scroll events it produces
 * (smooth-scroll animation, momentum) still count as the user's. `scrollend`
 * closes the window early where the browser supports it.
 */
const USER_SCROLL_WINDOW_MS = 600;

const SCROLL_UP_KEYS = new Set(['ArrowUp', 'PageUp', 'Home']);
const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' ']);

function distanceFromBottom(element: HTMLElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

function canScrollUp(element: HTMLElement): boolean {
  return element.scrollHeight - element.clientHeight > BOTTOM_EPSILON_PX && element.scrollTop > 0;
}

/**
 * Whether an upward scroll input starting at `target` is consumed by a nested
 * scroller (a code block, a surface) before it reaches the transcript. Such
 * input never moves the transcript, so it must not disengage autoscroll.
 */
function nestedScrollerConsumesUp(target: EventTarget | null, root: HTMLElement): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== root) {
    if (
      node instanceof HTMLElement &&
      node.scrollTop > 0 &&
      node.scrollHeight > node.clientHeight
    ) {
      const overflowY = window.getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return true;
    }
    node = node.parentElement;
  }
  return false;
}

interface TranscriptAutoscroll {
  /**
   * Whether layout growth and new output should pull the view to the bottom:
   * engaged AND the view is currently stuck to the bottom. Live ref for
   * effects and observers that must not re-render.
   */
  followingRef: RefObject<boolean>;
  /** Render-time engagement; the scroll-to-bottom control shows when false. */
  engaged: boolean;
  /** Programmatic scroll to the bottom. Never changes engagement. */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Re-engage and scroll to the bottom (the scroll-to-bottom control). */
  engage: () => void;
  /** Stop following, e.g. when the reader jumps to a landmark. */
  disengage: () => void;
  /** Register a content element whose size changes the follow must track. */
  observeContent: (element: HTMLElement | null) => void;
  onScroll: () => void;
  onWheel: (event: WheelEvent<HTMLElement>) => void;
  onScrollKey: (event: KeyboardEvent<HTMLElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onTouchStart: (event: TouchEvent<HTMLElement>) => void;
  onTouchMove: (event: TouchEvent<HTMLElement>) => void;
  onTouchEnd: () => void;
}

/**
 * Pin the transcript to its newest output until the reader scrolls away.
 *
 * Engagement changes only on user input: a user scroll away from the bottom
 * disengages; a user scroll back to the bottom, or {@link TranscriptAutoscroll.engage},
 * re-engages. Content growth, virtualizer measurement, and resize never count
 * as user intent — while engaged they are followed, while disengaged the view
 * stays where the reader left it.
 *
 * Following also requires the view to be stuck to the bottom. A non-user
 * programmatic navigation (a script's `scrollTo`, find-in-page, a focus
 * `scrollIntoView`) is not user intent, so it never disengages or shows the
 * button, but it does unstick the view: growth then leaves it where that code
 * put it instead of seizing it back. A scroll is navigation when the geometry
 * is unchanged since the last observation; one that coincides with a size
 * change (virtualizer compensation, a clamp) is layout and leaves the stuck
 * state alone.
 */
export function useTranscriptAutoscroll(
  scrollRef: RefObject<HTMLDivElement | null>,
): TranscriptAutoscroll {
  const engagedRef = useRef(true);
  const [engaged, setEngagedState] = useState(true);
  const stuckRef = useRef(true);
  const followingRef = useRef(true);
  // Geometry at the last scroll we observed or produced. Deliberately not
  // updated by the ResizeObserver, so the scroll event a resize causes still
  // reads as a size change.
  const geometryRef = useRef({ scrollHeight: -1, clientHeight: -1 });
  // The scrollTop our last instant programmatic scroll produced; the scroll
  // event reporting it is ours, never the reader's. One-shot, and dropped by
  // any user input so a reader returning to that exact spot still counts.
  const programmaticTopRef = useRef<number | null>(null);
  const lastUserInputAtRef = useRef(Number.NEGATIVE_INFINITY);
  const scrollbarPointerRef = useRef(false);
  const touchYRef = useRef<number | null>(null);
  const contentElementsRef = useRef(new Set<HTMLElement>());
  const observerRef = useRef<ResizeObserver | null>(null);

  const setStuck = useCallback((next: boolean) => {
    stuckRef.current = next;
    followingRef.current = engagedRef.current && next;
  }, []);

  const setEngaged = useCallback(
    (next: boolean) => {
      engagedRef.current = next;
      setEngagedState(next);
      // Every engagement lands the view at the bottom (the button scrolls
      // there; a reader scroll re-engages only on arrival).
      setStuck(next || stuckRef.current);
    },
    [setStuck],
  );

  const recordGeometry = useCallback((element: HTMLElement) => {
    geometryRef.current = {
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'instant') => {
      const element = scrollRef.current;
      if (!element) return;
      element.scrollTo({ behavior, top: element.scrollHeight });
      programmaticTopRef.current = behavior === 'smooth' ? null : element.scrollTop;
      recordGeometry(element);
      setStuck(true);
    },
    [recordGeometry, scrollRef, setStuck],
  );

  const engage = useCallback(() => {
    lastUserInputAtRef.current = Number.NEGATIVE_INFINITY;
    setEngaged(true);
    scrollToBottom('smooth');
  }, [scrollToBottom, setEngaged]);

  const disengage = useCallback(() => setEngaged(false), [setEngaged]);

  const noteUserInput = useCallback(() => {
    lastUserInputAtRef.current = performance.now();
    programmaticTopRef.current = null;
  }, []);

  /** Disengage now, before a queued follow can cancel the reader's scroll. */
  const yieldUp = useCallback(
    (target: EventTarget | null) => {
      const element = scrollRef.current;
      if (!element || !engagedRef.current) return;
      if (!canScrollUp(element) || nestedScrollerConsumesUp(target, element)) return;
      setEngaged(false);
    },
    [scrollRef, setEngaged],
  );

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const programmaticTop = programmaticTopRef.current;
    if (programmaticTop !== null && Math.abs(element.scrollTop - programmaticTop) <= 1) {
      programmaticTopRef.current = null;
      recordGeometry(element);
      return;
    }
    const previous = geometryRef.current;
    const resized =
      previous.scrollHeight !== element.scrollHeight ||
      previous.clientHeight !== element.clientHeight;
    recordGeometry(element);
    const atBottom = distanceFromBottom(element) <= BOTTOM_EPSILON_PX;
    // Navigation (geometry unchanged) decides stuck outright; a scroll caused
    // by a size change can only confirm it, never unstick.
    setStuck(resized ? stuckRef.current || atBottom : atBottom);
    const userDriven =
      scrollbarPointerRef.current ||
      touchYRef.current !== null ||
      performance.now() - lastUserInputAtRef.current <= USER_SCROLL_WINDOW_MS;
    if (!userDriven) return;
    if (atBottom) {
      if (!engagedRef.current) setEngaged(true);
    } else if (scrollbarPointerRef.current && engagedRef.current) {
      // Wheel, key, and touch disengage from their input events; a scrollbar
      // drag has no directional input event, only the scroll it produces.
      setEngaged(false);
    }
  }, [recordGeometry, scrollRef, setEngaged, setStuck]);

  const onWheel = useCallback(
    (event: WheelEvent<HTMLElement>) => {
      noteUserInput();
      if (event.deltaY < 0) {
        yieldUp(event.target);
        return;
      }
      const element = scrollRef.current;
      // Wheeling down while already at the bottom produces no scroll event.
      if (
        event.deltaY > 0 &&
        element &&
        !engagedRef.current &&
        distanceFromBottom(element) <= BOTTOM_EPSILON_PX
      ) {
        setEngaged(true);
      }
    },
    [noteUserInput, scrollRef, setEngaged, yieldUp],
  );

  const onScrollKey = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!SCROLL_KEYS.has(event.key)) return;
      noteUserInput();
      if (SCROLL_UP_KEYS.has(event.key) || (event.key === ' ' && event.shiftKey)) {
        yieldUp(event.target);
      }
    },
    [noteUserInput, yieldUp],
  );

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    // A press on the scroll container itself (not a row) is its scrollbar.
    if (event.target === event.currentTarget) {
      scrollbarPointerRef.current = true;
      programmaticTopRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback(
    (event: TouchEvent<HTMLElement>) => {
      noteUserInput();
      touchYRef.current = event.touches[0]?.clientY ?? null;
    },
    [noteUserInput],
  );

  const onTouchMove = useCallback(
    (event: TouchEvent<HTMLElement>) => {
      noteUserInput();
      const y = event.touches[0]?.clientY;
      if (y === undefined) return;
      const previous = touchYRef.current;
      touchYRef.current = y;
      // A finger moving down drags the content down: a scroll up.
      if (previous !== null && y > previous) yieldUp(event.target);
    },
    [noteUserInput, yieldUp],
  );

  const onTouchEnd = useCallback(() => {
    // Momentum after the finger lifts still belongs to this gesture.
    noteUserInput();
    touchYRef.current = null;
  }, [noteUserInput]);

  useEffect(() => {
    const releasePointer = () => {
      scrollbarPointerRef.current = false;
    };
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    return () => {
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
    };
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const closeGesture = () => {
      if (!scrollbarPointerRef.current && touchYRef.current === null) {
        lastUserInputAtRef.current = Number.NEGATIVE_INFINITY;
      }
    };
    element.addEventListener('scrollend', closeGesture);
    return () => element.removeEventListener('scrollend', closeGesture);
  }, [scrollRef]);

  // Follow every size change of the viewport or its content while engaged.
  // ResizeObserver delivers after layout and before paint, so the pinned view
  // never shows a frame of un-followed growth.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (followingRef.current) scrollToBottom('instant');
    });
    observerRef.current = observer;
    observer.observe(element);
    for (const content of contentElementsRef.current) observer.observe(content);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [scrollRef, scrollToBottom]);

  const observeContent = useCallback((content: HTMLElement | null) => {
    const observer = observerRef.current;
    for (const previous of contentElementsRef.current) {
      if (previous.isConnected) continue;
      contentElementsRef.current.delete(previous);
      observer?.unobserve(previous);
    }
    if (!content || contentElementsRef.current.has(content)) return;
    contentElementsRef.current.add(content);
    observer?.observe(content);
  }, []);

  return {
    followingRef,
    engaged,
    scrollToBottom,
    engage,
    disengage,
    observeContent,
    onScroll,
    onWheel,
    onScrollKey,
    onPointerDown,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
