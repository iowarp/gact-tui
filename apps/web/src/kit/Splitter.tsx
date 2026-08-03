import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import './splitter.css';

export interface SplitterProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Pixels moved per arrow press. */
  step?: number;
  onResize: (value: number) => void;
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
export function Splitter({ label, value, min, max, step = 8, onResize }: SplitterProps) {
  const dragRef = useRef<{ startX: number; startValue: number } | null>(null);

  const clamp = useCallback((n: number) => Math.max(min, Math.min(max, n)), [min, max]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      let next: number | null = null;
      if (event.key === 'ArrowRight') next = value + step;
      else if (event.key === 'ArrowLeft') next = value - step;
      else if (event.key === 'Home') next = min;
      else if (event.key === 'End') next = max;
      if (next === null) return;
      event.preventDefault();
      onResize(clamp(next));
    },
    [clamp, max, min, onResize, step, value],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      dragRef.current = { startX: event.clientX, startValue: value };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [value],
  );

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      onResize(clamp(drag.startValue + (event.clientX - drag.startX)));
    }
    function onUp() {
      dragRef.current = null;
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [clamp, onResize]);

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
    />
  );
}
