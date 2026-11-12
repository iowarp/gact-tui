import { useReducedMotionConfig } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

/** About one operations poll, so the count keeps moving until the next report. */
const COUNT_UP_MS = 1400;

/**
 * A reported count that rises at frame cadence between reports instead of
 * jumping by a whole listing page. It only ever counts up to a value the owner
 * reported; a lower value, a new `reset` key or reduced motion shows the report
 * as is.
 */
export function useCountUp(target: number, reset?: unknown, spanMs = COUNT_UP_MS): number {
  const reduceMotion = useReducedMotionConfig();
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const resetRef = useRef(reset);
  useEffect(() => {
    const from = shownRef.current;
    const fresh = !Object.is(resetRef.current, reset);
    resetRef.current = reset;
    if (reduceMotion || fresh || !Number.isFinite(target) || target <= from) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - start) / spanMs);
      const next = progress === 1 ? target : Math.floor(from + (target - from) * progress);
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, reset, reduceMotion, spanMs]);
  return shown;
}

/**
 * A task's reported progress with its entry count rising between reports.
 * Byte and other progress pass through untouched.
 */
export function useCountedTaskProgress(
  progress: Record<string, unknown> | undefined,
  reset?: unknown,
): Record<string, unknown> | undefined {
  const key =
    typeof progress?.completed === 'number'
      ? progress.unit === 'entries'
        ? 'completed'
        : undefined
      : typeof progress?.entries_done === 'number'
        ? 'entries_done'
        : undefined;
  const reported = key ? (progress?.[key] as number) : 0;
  const shown = useCountUp(reported, reset);
  return key && shown !== reported ? { ...progress, [key]: shown } : progress;
}
