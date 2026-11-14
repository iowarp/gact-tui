import { readThemeColor } from '@/theme/runtime';
import { viewSnapshotFor } from './mcp-app-look';

/**
 * App views inside a captured surface (a dashboard's `clio.mcp-app.v1`, CM2). A view is a
 * sandboxed frame on its own origin, so the DOM clone a capture starts from shows it
 * blank. Each mounted view is painted from the snapshot CLIO's sandbox document takes of
 * it (the one `look_at_view` and comments use), at the frame's box. A view with no
 * snapshot is painted as a labelled box naming the typed reason, never left blank.
 */

/** The frames a capture leaves out of its DOM clone and paints itself. */
export function isAppFrame(node: Element): boolean {
  return node.matches('iframe[data-mcp-app-iframe]');
}

/** Gaps that do not change what the view shows (a canvas the view keeps blank). */
const QUIET = new Set(['webgl_canvas_idle', 'wrapped_text_not_drawn']);

function paintGapNote(
  context: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  text: string,
  scale: number,
): void {
  const height = 22 * scale;
  context.save();
  context.fillStyle = readThemeColor('media-backdrop');
  context.fillRect(box.x, box.y + box.height - height, box.width, height);
  context.fillStyle = readThemeColor('media-foreground');
  context.font = `${Math.round(12 * scale)}px sans-serif`;
  context.textBaseline = 'middle';
  context.fillText(
    text,
    box.x + 8 * scale,
    box.y + box.height - height / 2,
    box.width - 16 * scale,
  );
  context.restore();
}

function loadImage(data: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = data;
  return image.decode().then(() => image);
}

function paintRefusal(
  context: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  text: string,
  scale: number,
): void {
  context.save();
  context.fillStyle = readThemeColor('muted');
  context.fillRect(box.x, box.y, box.width, box.height);
  context.strokeStyle = readThemeColor('border');
  context.lineWidth = Math.max(1, scale);
  context.strokeRect(box.x, box.y, box.width, box.height);
  context.fillStyle = readThemeColor('foreground');
  context.font = `${Math.round(13 * scale)}px sans-serif`;
  context.textBaseline = 'top';
  context.fillText(text, box.x + 10 * scale, box.y + 10 * scale, box.width - 20 * scale);
  context.restore();
}

/** Paint every app view inside `target` onto `context` (the capture canvas). */
export async function paintAppFrames(
  context: CanvasRenderingContext2D,
  target: HTMLElement,
  scaleX: number,
  scaleY: number,
): Promise<void> {
  const origin = target.getBoundingClientRect();
  for (const frame of target.querySelectorAll<HTMLIFrameElement>('iframe[data-mcp-app-iframe]')) {
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const box = {
      x: (rect.left - origin.left) * scaleX,
      y: (rect.top - origin.top) * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY,
    };
    const take = viewSnapshotFor(frame);
    // i18n-ignore: painted into the capture the agent reads, kept in English like other text sent to the agent
    let refusal = 'View not captured: the view has not finished loading (view_not_ready).';
    if (take) {
      try {
        const snapshot = await take({ scale: scaleX, maxSide: 4096 });
        if ('image' in snapshot) {
          context.drawImage(await loadImage(snapshot.image), box.x, box.y, box.width, box.height);
          const gaps = [
            ...new Set(snapshot.skipped.map((row) => row.reason).filter((r) => !QUIET.has(r))),
          ];
          if (gaps.length)
            // i18n-ignore: painted into the capture the agent reads, kept in English like other text sent to the agent
            paintGapNote(context, box, `Not in this picture: ${gaps.join(', ')}`, scaleX);
          continue;
        }
        // i18n-ignore: painted into the capture the agent reads, kept in English like other text sent to the agent
        refusal = `View not captured: ${snapshot.error.message} (${snapshot.error.reason}).`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // i18n-ignore: painted into the capture the agent reads, kept in English like other text sent to the agent
        refusal = `View not captured: ${message} (snapshot_failed).`;
      }
    }
    paintRefusal(context, box, refusal, scaleX);
  }
}
