import type { McpAppSnapshot } from '@clio/core/v3';
import type { TakeSnapshot } from './mcp-app-look';

/**
 * Whether a view that finished `ui/initialize` has drawn anything (FP-D9).
 *
 * A view can initialize and still show nothing (a viewer that needs more width than the
 * frame gives it draws an empty page). "Ready" would then be untrue, so after the view
 * initializes the host looks at it with the same snapshot `look_at_view` uses, at a small
 * size, a few times while it settles. The probes stop at the first answer that shows
 * something, or that cannot be read; they never close, expire or reload the view
 * (rule 6). A frame that resizes is looked at again.
 */
export type PaintVerdict = 'pending' | 'drawn' | 'blank' | 'unknown';

/** When the host looks after `initialized`, in milliseconds: the view's settling time. */
export const FIRST_PAINT_PROBES_MS = [800, 2500, 6000] as const;
/** How long after a resize a view the host saw blank is looked at again. */
export const RESIZE_RECHECK_MS = 800;

/** Gaps that mean something is drawn that the host cannot read. */
const UNREADABLE = new Set(['cross_origin_pixels', 'frame_cross_origin', 'not_drawable']);

/** What one snapshot says about the view's paint. */
export function paintVerdict(snapshot: McpAppSnapshot): Exclude<PaintVerdict, 'pending'> {
  if ('error' in snapshot) {
    // No size on screen draws nothing; any other refusal cannot tell.
    return snapshot.error.reason === 'view_not_laid_out' ? 'blank' : 'unknown';
  }
  const drawn = Object.values(snapshot.painted).reduce((sum, count) => sum + (count || 0), 0);
  if (drawn > 0) return 'drawn';
  return snapshot.skipped.some((gap) => UNREADABLE.has(gap.reason)) ? 'unknown' : 'blank';
}

/** Watch one mounted view's first paint; returns `recheck` (on resize) and `stop`. */
export function watchFirstPaint(
  take: TakeSnapshot,
  onVerdict: (verdict: PaintVerdict) => void,
): { recheck: () => void; stop: () => void } {
  let stopped = false;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const look = async (remaining: readonly number[]) => {
    let verdict: Exclude<PaintVerdict, 'pending'>;
    try {
      verdict = paintVerdict(await take({ scale: 0.25, maxSide: 256 }));
    } catch {
      verdict = 'unknown';
    }
    if (stopped) return;
    if (verdict !== 'blank' || remaining.length === 0) {
      settled = verdict !== 'blank';
      onVerdict(verdict);
      return;
    }
    schedule(remaining);
  };
  const schedule = (delays: readonly number[]) => {
    const [first, ...rest] = delays;
    if (first === undefined || stopped) return;
    timer = setTimeout(() => void look(rest), first);
  };
  onVerdict('pending');
  schedule(FIRST_PAINT_PROBES_MS);
  return {
    recheck: () => {
      if (stopped || settled) return;
      if (timer !== undefined) clearTimeout(timer);
      schedule([RESIZE_RECHECK_MS]);
    },
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
