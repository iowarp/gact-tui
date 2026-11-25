import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';

/** The longest an ancestor's animation is followed frame by frame (a missed end event). */
const FOLLOW_LIMIT_MS = 2000;

/**
 * How far the split's grip reaches past its line into the canvas side (half of
 * its 12 px hit area). The keeper is drawn above the conversation's section, so
 * over the split it starts this far right of the slot and leaves the grip's
 * canvas-side half free to grab.
 */
export const WORKBENCH_SPLIT_GRIP_PX = 6;

/** The keeper's box over the split's slot, clear of the grip's canvas-side half. */
export function clearOfSplitGrip(bounds: CSSProperties | undefined): CSSProperties | undefined {
  if (!bounds || typeof bounds.left !== 'number' || typeof bounds.width !== 'number') return bounds;
  return {
    ...bounds,
    left: bounds.left + WORKBENCH_SPLIT_GRIP_PX,
    width: Math.max(0, bounds.width - WORKBENCH_SPLIT_GRIP_PX),
  };
}

/**
 * Whether the person is dragging a split inside `host`.
 *
 * The panels library marks the separator it drags `data-separator="active"`,
 * wherever in its hit region the press landed. While that holds the keeper lets
 * the pointer through: an App view's iframe would otherwise take the moves once
 * the pointer crosses into the canvas, and the split would stop following it.
 */
export function useWorkbenchSplitDrag(host: HTMLElement | null): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!host) return;
    const check = () => {
      const active = host.querySelector('[data-slot=resizable-handle][data-separator=active]');
      setDragging(active !== null);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(host, { attributeFilter: ['data-separator'], subtree: true });
    return () => {
      observer.disconnect();
      setDragging(false);
    };
  }, [host]);
  return dragging;
}

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
