import { useEffect, useRef, type RefObject } from 'react';

/** A click or tap on the canvas, in canvas pixels; `touch` asks for a larger snap radius. */
export interface CanvasPoint {
  x: number;
  y: number;
  touch: boolean;
}

const CLICK_SLOP_PX = 5;
const CLICK_MS = 700;

/**
 * Clicks and hover on the 3D canvas, told apart from orbit drags: a press that moves less
 * than a few pixels and is released quickly is a click. Hover is reported at most once per
 * frame and only while no button is held (orbiting is not hovering).
 */
export function useCanvasPointer(
  host: RefObject<HTMLElement | null>,
  handlers: { onClick: (point: CanvasPoint) => void; onHover?: (point: CanvasPoint | undefined) => void },
): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let down: { x: number; y: number; at: number } | undefined;
    let frame = 0;
    const local = (event: PointerEvent): CanvasPoint => {
      const rect = element.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        touch: event.pointerType !== 'mouse',
      };
    };
    const onDown = (event: PointerEvent) => {
      down = event.isPrimary ? { x: event.clientX, y: event.clientY, at: event.timeStamp } : undefined;
    };
    const onUp = (event: PointerEvent) => {
      const start = down;
      down = undefined;
      if (!start || event.button !== 0) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > CLICK_SLOP_PX || event.timeStamp - start.at > CLICK_MS) return;
      latest.current.onClick(local(event));
    };
    const onMove = (event: PointerEvent) => {
      if (event.buttons || event.pointerType !== 'mouse' || !latest.current.onHover) return;
      const point = local(event);
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        latest.current.onHover?.(point);
      });
    };
    const onLeave = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      latest.current.onHover?.(undefined);
    };
    // Capture: OrbitControls captures the pointer on the canvas inside.
    element.addEventListener('pointerdown', onDown, true);
    element.addEventListener('pointerup', onUp, true);
    element.addEventListener('pointermove', onMove, true);
    element.addEventListener('pointerleave', onLeave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      element.removeEventListener('pointerdown', onDown, true);
      element.removeEventListener('pointerup', onUp, true);
      element.removeEventListener('pointermove', onMove, true);
      element.removeEventListener('pointerleave', onLeave);
    };
  }, [host]);
}
