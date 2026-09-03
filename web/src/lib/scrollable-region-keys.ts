import type { KeyboardEvent } from 'react';

/** Pixels one arrow press moves a keyboard-scrollable region. */
const LINE_STEP_PX = 40;

/** Pixels of the previous view kept in place across a page press. */
const PAGE_OVERLAP_PX = 24;

/**
 * Keyboard scrolling for a region that is focusable in its own right.
 *
 * Both the pending-response stack and the transcript minimap are `tabIndex={0}`
 * panels that scroll independently of the page, so a reader who tabs into one
 * expects Home/End/PageUp/PageDown/arrows to move it. Neither is a listbox, so
 * nothing gives them that behavior for free.
 *
 * The guard on the event target is the whole reason this is shared rather than
 * copied: the stack mounts real form fields, and a handler that acts on every
 * bubbled key press steals Home, End and the arrows from the textarea the
 * reader is typing an answer into. Only a press that landed on the region
 * itself scrolls it; anything from a descendant is left alone.
 */
export function handleScrollableRegionKeys(event: KeyboardEvent<HTMLElement>): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target !== event.currentTarget) return;
  const region = event.currentTarget;
  const page = Math.max(region.clientHeight - PAGE_OVERLAP_PX, LINE_STEP_PX);
  const destinations: Partial<Record<string, number>> = {
    ArrowDown: region.scrollTop + LINE_STEP_PX,
    ArrowUp: region.scrollTop - LINE_STEP_PX,
    End: region.scrollHeight,
    Home: 0,
    PageDown: region.scrollTop + page,
    PageUp: region.scrollTop - page,
  };
  const destination = destinations[event.key];
  if (destination === undefined) return;
  event.preventDefault();
  region.scrollTop = Math.max(
    0,
    Math.min(destination, region.scrollHeight - region.clientHeight),
  );
}
