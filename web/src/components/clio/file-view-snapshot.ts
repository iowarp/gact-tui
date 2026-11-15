import type { McpAppSnapshot, McpAppSnapshotSkip } from '@clio/core/v3';
import { getFontEmbedCSS, toCanvas } from 'html-to-image';
import { isTransparentColor, resolveCardBackground } from './surface-export';

/**
 * A picture of a client-rendered file view exactly as the person sees it (FV-D2, FV-D3):
 * the background behind it, its live canvases (a WebGL scene drawn now, so no preserved
 * drawing buffer is needed), then the HTML over them (measurement labels, panels, the
 * size caption, the axis gizmo), cloned with html-to-image without the canvases or the
 * comment marks. The answer has the app snapshot's shape, so looks and comments treat
 * both alike; what could not be drawn is a typed gap, never left out silently.
 */

export interface ClientViewSnapshotOptions {
  /** Image pixels per CSS pixel. */
  scale?: number;
  /** The longest side of the image, in pixels. */
  maxSide?: number;
}

/** Nodes the clone leaves out: canvases are painted from their live pixels, and marks and
 * other comment tools (`data-capture-ui`) are not part of the view. */
export function clonedNode(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return true;
  const element = node as Element;
  return !(element instanceof HTMLCanvasElement || element.getAttribute('data-capture-ui') === 'true');
}

function failed(reason: string, message: string): McpAppSnapshot {
  return { error: { reason, message } };
}

/** Snapshot `root`; `live` draws the renderer's canvas now (and returns it). */
export async function snapshotClientView(
  root: HTMLElement,
  live: (() => HTMLCanvasElement | undefined) | undefined,
  { scale = 1, maxSide = 4096 }: ClientViewSnapshotOptions = {},
): Promise<McpAppSnapshot> {
  const frame = root.getBoundingClientRect();
  if (!frame.width || !frame.height)
    // i18n-ignore: a typed reason returned to the agent
    return failed('view_not_laid_out', 'The view has no size on screen.');
  const fit = Math.min(scale, maxSide / Math.max(frame.width, frame.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(frame.width * fit));
  canvas.height = Math.max(1, Math.round(frame.height * fit));
  const context = canvas.getContext('2d');
  // i18n-ignore: a typed reason returned to the agent
  if (!context) return failed('snapshot_failed', 'The browser could not create an image.');
  const painted: Record<string, number> = { canvas: 0, html: 0 };
  const skipped: McpAppSnapshotSkip[] = [];
  // What shows through: the page behind the view, then the view's own (translucent) ground.
  context.fillStyle = resolveCardBackground(root.parentElement);
  context.fillRect(0, 0, canvas.width, canvas.height);
  const own = getComputedStyle(root).backgroundColor;
  if (!isTransparentColor(own)) {
    context.fillStyle = own;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  // Drawn now, in this task: a WebGL canvas reads blank after the browser composites it.
  live?.();
  for (const source of root.querySelectorAll('canvas')) {
    const rect = source.getBoundingClientRect();
    if (!rect.width || !rect.height || !source.width || !source.height) continue;
    try {
      context.drawImage(
        source,
        (rect.left - frame.left) * fit,
        (rect.top - frame.top) * fit,
        rect.width * fit,
        rect.height * fit,
      );
      painted.canvas = (painted.canvas ?? 0) + 1;
    } catch {
      skipped.push({ what: 'canvas', reason: 'canvas_not_readable', count: 1 });
    }
  }
  try {
    const overlay = await toCanvas(root, {
      cacheBust: false,
      includeQueryParams: true,
      backgroundColor: 'transparent',
      fontEmbedCSS: await getFontEmbedCSS(root),
      pixelRatio: fit,
      // The view's ground is painted above; in the clone it would cover the canvases.
      style: { background: 'transparent', backgroundColor: 'transparent' },
      filter: clonedNode,
    });
    context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
    painted.html = 1;
  } catch {
    skipped.push({ what: 'html', reason: 'html_overlay_not_drawn' });
  }
  return {
    image: canvas.toDataURL('image/png'),
    width: Math.round(frame.width),
    height: Math.round(frame.height),
    scale: fit,
    painted,
    skipped,
  };
}
