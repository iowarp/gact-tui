import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import './splitter.css';

export interface SplitterProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Pixels moved per arrow press. */
  step?: number;
  /**
   * Reverses the drag/arrow direction: for a RIGHT-side pane the separator
   * rides the pane's LEFT edge, so dragging left GROWS the value. Leave off
   * for a left-side pane (the rail), where dragging right grows it.
   */
  invert?: boolean;
  onResize: (value: number) => void;
  /** Double-click reset (the prototype's snap-back-to-default gesture). */
  onReset?: () => void;
}

/**
 * The pane splitter — the prototype's resizable rail dividers (a 6px
 * col-resize strip pulled back over its neighbour by -6px).
 *
 * The prototype's own dividers are pointer-only. This one is also a real
 * `separator` with arrow-key resizing and announced bounds: a pane a keyboard
 * user cannot resize is a pane they cannot use, and that is a gap worth
 * closing in the rebuild rather than reproducing.
 */
export function Splitter({ label, value, min, max, step = 8, invert = false, onResize, onReset }: SplitterProps) {
  const dragRef = useRef<{ startX: number; startValue: number } | null>(null);

  const clamp = useCallback((n: number) => Math.max(min, Math.min(max, n)), [min, max]);
  const sign = invert ? -1 : 1;

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      let next: number | null = null;
      if (event.key === 'ArrowRight') next = value + sign * step;
      else if (event.key === 'ArrowLeft') next = value - sign * step;
      else if (event.key === 'Home') next = min;
      else if (event.key === 'End') next = max;
      if (next === null) return;
      event.preventDefault();
      onResize(clamp(next));
    },
    [clamp, max, min, onResize, sign, step, value],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Killing the default matters: after a double-click has selected the
      // word under the handle, the NEXT press would start a browser text
      // DRAG — the browser then fires pointercancel and our move stream
      // dies mid-drag (live-observed: the pane froze one step in).
      event.preventDefault();
      event.currentTarget.focus();
      dragRef.current = { startX: event.clientX, startValue: value };
      // Optional call: pointer capture is real-browser API surface (jsdom
      // has no implementation, and the drag works through the document
      // listeners either way — capture just keeps hover states honest).
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [value],
  );

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      onResize(clamp(drag.startValue + sign * (event.clientX - drag.startX)));
    }
    function onUp() {
      dragRef.current = null;
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    // A cancelled pointer (browser gesture takeover) ends the drag exactly
    // like a release — otherwise the NEXT unrelated move keeps resizing.
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [clamp, onResize, sign]);

  return (
    <div
      className="kit-splitter"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      {...(onReset ? { onDoubleClick: () => onReset() } : {})}
    />
  );
}
