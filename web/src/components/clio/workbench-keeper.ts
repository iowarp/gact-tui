import { useLayoutEffect, useState, type CSSProperties } from 'react';

/** The longest an ancestor's animation is followed frame by frame (a missed end event). */
const FOLLOW_LIMIT_MS = 2000;

/**
 * Where the workbench keeper sits: fixed over `slot`'s box, the empty place the
 * current layout (the split panel or the phone sheet) keeps for the canvas.
 *
 * The canvas never moves in the DOM when the layout changes: moving an iframe
 * reloads it, so a resize across the split breakpoint would remount every App
 * view in it. The box follows resizes of the slot and its ancestors, scrolls,
 * and, frame by frame, an ancestor's animation (the sheet sliding in).
 */
export function useWorkbenchSlotBounds(slot: HTMLElement | null): CSSProperties | undefined {
  const [bounds, setBounds] = useState<CSSProperties>();
  useLayoutEffect(() => {
    if (!slot) return;
    let frame = 0;
    const moving = new Map<EventTarget, number>();
    const measure = () => {
      const box = slot.getBoundingClientRect();
      setBounds((last) =>
        last &&
        last.top === box.top &&
        last.left === box.left &&
        last.width === box.width &&
        last.height === box.height
          ? last
          : { top: box.top, left: box.left, width: box.width, height: box.height },
      );
    };
    const tick = () => {
      frame = 0;
      measure();
      const now = performance.now();
      for (const [target, since] of moving) {
        if (!(target instanceof Node) || !target.isConnected || now - since > FOLLOW_LIMIT_MS)
          moving.delete(target);
      }
      if (moving.size) frame = window.requestAnimationFrame(tick);
    };
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(tick);
    };
    const start = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node) || !target.contains(slot)) return;
      moving.set(target, performance.now());
      update();
    };
    const stop = (event: Event) => {
      if (event.target && moving.delete(event.target)) update();
    };
    measure();
    const observer = new ResizeObserver(update);
    for (let node: Element | null = slot; node; node = node.parentElement) observer.observe(node);
    const options = { capture: true, passive: true };
    document.addEventListener('animationstart', start, options);
    document.addEventListener('transitionrun', start, options);
    document.addEventListener('animationend', stop, options);
    document.addEventListener('animationcancel', stop, options);
    document.addEventListener('transitionend', stop, options);
    document.addEventListener('transitioncancel', stop, options);
    document.addEventListener('scroll', update, options);
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('animationstart', start, options);
      document.removeEventListener('transitionrun', start, options);
      document.removeEventListener('animationend', stop, options);
      document.removeEventListener('animationcancel', stop, options);
      document.removeEventListener('transitionend', stop, options);
      document.removeEventListener('transitioncancel', stop, options);
      document.removeEventListener('scroll', update, options);
      window.removeEventListener('resize', update);
    };
  }, [slot]);
  return slot ? bounds : undefined;
}
