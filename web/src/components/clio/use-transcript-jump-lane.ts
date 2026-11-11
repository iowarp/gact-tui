import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Whether the jump-to-latest lane shows, held back while a disclosure press is
 * in progress so the lane never slides under the pointer.
 */
export function useTranscriptJumpLane({
  engaged,
  adrift,
  scrollable,
  hasMessages,
  scrollRef,
  captureReadingAnchor,
}: {
  engaged: boolean;
  adrift: boolean;
  scrollable: boolean;
  hasMessages: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  captureReadingAnchor: (target?: Element) => void;
}) {
  // Pressing a disclosure disengages on pointerdown. Mounting the jump lane
  // right then would slide it over a control in the last 40px, and the
  // pointerup and click would land on the lane. Hold it until the press ends.
  const [pressHold, setPressHold] = useState(false);
  const pressedRef = useRef<Element | null>(null);
  useEffect(() => {
    if (!pressHold) return undefined;
    let timer = 0;
    // A task later than pointerup, so the click has been dispatched.
    const release = () => {
      timer = window.setTimeout(() => setPressHold(false), 0);
    };
    window.addEventListener('pointerup', release, { once: true });
    window.addEventListener('pointercancel', release, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [pressHold]);

  const jumpVisible = (!engaged || adrift) && scrollable && hasMessages && !pressHold;

  // When the lane appears under the control the reader just pressed, lift the
  // view by the overlap so that control stays visible and clickable.
  useLayoutEffect(() => {
    if (!jumpVisible) return;
    const pressed = pressedRef.current;
    pressedRef.current = null;
    const element = scrollRef.current;
    const lane = element?.querySelector('[data-slot="transcript-control-lane"]');
    if (!pressed?.isConnected || !element || !lane) return;
    const overlap = pressed.getBoundingClientRect().bottom - lane.getBoundingClientRect().top;
    if (overlap <= 0) return;
    element.scrollTop += overlap;
    captureReadingAnchor(pressed);
  }, [jumpVisible, captureReadingAnchor, scrollRef]);

  /** Holds the lane back until the press on `disclosure` ends. */
  const holdPress = (disclosure: Element) => {
    pressedRef.current = disclosure;
    setPressHold(true);
  };
  return { jumpVisible, holdPress };
}
