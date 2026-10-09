import type { HTMLAttributes, MouseEventHandler } from 'react';
import { useMemo } from 'react';

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
): Pick<HTMLAttributes<HTMLDivElement>,
  'onPointerDownCapture' | 'onPointerMoveCapture' | 'onPointerUpCapture' | 'onPointerCancelCapture'> {
  return useMemo(() => ({
    onPointerDownCapture(event) {
      if (!enabled || event.button !== 0 ||
        (!selectionMode && !event.shiftKey && !event.ctrlKey && !event.metaKey)) return;
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
  }), [enabled, selectionMode, handlers]);
}
