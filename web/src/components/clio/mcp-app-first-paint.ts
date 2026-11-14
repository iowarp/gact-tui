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
/** Gaps that mean a WebGL canvas, usually the view's main drawing, drew nothing. */
const GL_SILENT = new Set(['webgl_frame_not_redrawn', 'webgl_canvas_idle']);
/**
 * Under this share of differing pixels a picture is empty: an icon or two on a blank page.
 * Measured live: a molecule viewer that drew nothing at phone width, 0.8% to 1.04% (its
 * axes widget and menu button); the same viewer with the molecule drawn, about 6%.
 */
const EMPTY_SHARE = 0.015;
/** Under this share, with its WebGL drawing silent, the view shows only its chrome. */
const CHROME_SHARE = 0.03;

/**
 * What one snapshot says about the view's paint. `coverage` is the share of the picture's
 * pixels that differ from its most common colour, when the browser could measure it: a
 * view whose main WebGL canvas drew nothing can still paint a toolbar icon or an axes
 * widget, which is not a drawn view.
 */
export function paintVerdict(
  snapshot: McpAppSnapshot,
  coverage?: number,
): Exclude<PaintVerdict, 'pending'> {
  if ('error' in snapshot) {
    // No size on screen draws nothing; any other refusal cannot tell.
    return snapshot.error.reason === 'view_not_laid_out' ? 'blank' : 'unknown';
  }
  if (coverage !== undefined) {
    if (coverage < EMPTY_SHARE) return 'blank';
    const silent = snapshot.skipped.some((gap) => GL_SILENT.has(gap.reason));
    if (silent && coverage < CHROME_SHARE) return 'blank';
  }
  const drawn = Object.values(snapshot.painted).reduce((sum, count) => sum + (count || 0), 0);
  if (drawn > 0) return 'drawn';
  return snapshot.skipped.some((gap) => UNREADABLE.has(gap.reason)) ? 'unknown' : 'blank';
}

/**
 * The share of `image`'s pixels away from its most common colour. Undefined when the
 * browser cannot measure it (no 2D canvas, an image it cannot decode): the verdict then
 * rests on what the snapshot counted.
 */
export async function pictureCoverage(image: string): Promise<number | undefined> {
  try {
    const picture = new Image();
    picture.src = image;
    await picture.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.min(128, picture.naturalWidth));
    canvas.height = Math.max(
      1,
      Math.round((canvas.width * picture.naturalHeight) / Math.max(1, picture.naturalWidth)),
    );
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const counts = new Map<number, number>();
    for (let i = 0; i < data.length; i += 4) {
      // Colours quantized to 4 bits a channel, so antialiasing does not split the background.
      const key = ((data[i]! >> 4) << 8) | ((data[i + 1]! >> 4) << 4) | (data[i + 2]! >> 4);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = data.length / 4;
    return total ? (total - Math.max(...counts.values())) / total : undefined;
  } catch {
    return undefined;
  }
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
      const snapshot = await take({ scale: 0.25, maxSide: 256 });
      const coverage = 'image' in snapshot ? await pictureCoverage(snapshot.image) : undefined;
      verdict = paintVerdict(snapshot, coverage);
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
