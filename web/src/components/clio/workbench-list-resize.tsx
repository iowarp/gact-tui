import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { MAX_LIST_SHARE, MIN_LIST_WIDTH } from './workbench-list-width';

const KEY_STEP = 16;

/**
 * The list's left edge: the hairline is the border; hovered or focused it
 * shows as the handle. Drag it, or arrow it when focused, to resize the list.
 */
export function WorkbenchListResizeHandle({
  title,
  share,
  sectionRef,
  resizeTo,
  commit,
  reset,
}: {
  title: string;
  share: number;
  sectionRef: RefObject<HTMLElement | null>;
  resizeTo: (width: number) => void;
  commit: () => void;
  reset: () => void;
}) {
  const drag = useRef<{ x: number; width: number; frame: number; clientX: number }>(null);
  const currentWidth = () => sectionRef.current?.getBoundingClientRect().width ?? 0;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    drag.current = { x: event.clientX, width: currentWidth(), frame: 0, clientX: event.clientX };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    state.clientX = event.clientX;
    if (state.frame) return;
    // One layout per display frame, however fast the pointer reports.
    state.frame = window.requestAnimationFrame(() => {
      state.frame = 0;
      // The handle is on the list's left: moving left widens it.
      resizeTo(state.width + state.x - state.clientX);
    });
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    if (state.frame) window.cancelAnimationFrame(state.frame);
    if (event.type === 'pointerup') resizeTo(state.width + state.x - event.clientX);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    commit();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const width = currentWidth();
    let next: number | undefined;
    if (event.key === 'ArrowLeft') next = width + step;
    else if (event.key === 'ArrowRight') next = width - step;
    else if (event.key === 'Home') next = MIN_LIST_WIDTH;
    else if (event.key === 'End') next = Number.POSITIVE_INFINITY;
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    resizeTo(next);
  };

  return (
    <div
      aria-label={`Resize ${title} list`}
      aria-orientation="vertical"
      aria-valuemax={Math.round(MAX_LIST_SHARE * 100)}
      aria-valuemin={0}
      aria-valuenow={Math.round(share * 100)}
      aria-valuetext={`${Math.round(share * 100)}% of the canvas`}
      className={cn(
        // A 12 px grip centred on the 1 px border; only hover and focus show it.
        'group/list-resize absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none outline-none',
        'before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-transparent before:transition-colors motion-reduce:before:transition-none',
        'hover:before:w-0.5 hover:before:bg-primary/50 focus-visible:before:w-0.5 focus-visible:before:bg-primary/70',
      )}
      data-slot="workbench-list-resize"
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
      onKeyUp={commit}
      onLostPointerCapture={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      role="separator"
      tabIndex={0}
    />
  );
}
