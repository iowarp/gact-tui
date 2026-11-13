import type { HTMLAttributes, MouseEventHandler } from 'react';
import { useMemo } from 'react';

/** Container-relative pixel coordinates of a rubber-band drag in progress. */
export interface DragBox {
  startX: number;
  startY: number;
  x: number;
  y: number;
}

/** Pixels a shift+drag must move before it counts as a zone (not a shift+click). */
const ZONE_DRAG_THRESHOLD_PX = 4;

/** A finished drag moved far enough to select a zone rather than act as a click. */
export function dragIsZone(box: DragBox): boolean {
  return (
    Math.abs(box.x - box.startX) > ZONE_DRAG_THRESHOLD_PX ||
    Math.abs(box.y - box.startY) > ZONE_DRAG_THRESHOLD_PX
  );
}

/** Own selection gestures through release or cancellation outside the map. */
export function useMapSelectionPointerHandlers(
  enabled: boolean,
  selectionMode: boolean,
  handlers: {
    start: MouseEventHandler<HTMLDivElement>;
    move: MouseEventHandler<HTMLDivElement>;
    finish: MouseEventHandler<HTMLDivElement>;
    cancel: () => void;
  },
): Pick<
  HTMLAttributes<HTMLDivElement>,
  'onPointerDownCapture' | 'onPointerMoveCapture' | 'onPointerUpCapture' | 'onPointerCancelCapture'
> {
  return useMemo(
    () => ({
      onPointerDownCapture(event) {
        if (
          !enabled ||
          event.button !== 0 ||
          (!selectionMode && !event.shiftKey && !event.ctrlKey && !event.metaKey)
        )
          return;
        // Capture the release even over the composer. start prevents the pointer
        // default so MapLibre cannot begin a competing compatibility mouse drag.
        event.currentTarget.setPointerCapture(event.pointerId);
        handlers.start(event);
      },
      onPointerMoveCapture(event) {
        handlers.move(event);
      },
      onPointerUpCapture(event) {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        handlers.finish(event);
        event.currentTarget.releasePointerCapture(event.pointerId);
      },
      onPointerCancelCapture(event) {
        handlers.cancel();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      },
    }),
    [enabled, selectionMode, handlers],
  );
}
