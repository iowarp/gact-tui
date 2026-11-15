import type { CommentAttachment, McpAppSnapshot } from '@clio/core/v3';
import type { DraftMark } from './comment-model';
import { readThemeColor } from '@/theme/runtime';

/** The snapshot a mark kept of the view when it was made (CM3). */
export interface Capture {
  snapshot: McpAppSnapshot;
}

const OVERVIEW_SIDE = 1568;

function loadImage(data: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = data;
  return image.decode().then(() => image);
}

async function overviewPng(image: HTMLImageElement, marks: readonly DraftMark[]): Promise<string> {
  // The overview is for orientation: at most OVERVIEW_SIDE pixels on its longest side.
  const fit = Math.min(1, OVERVIEW_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * fit));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * fit));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not draw the overview.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const unit = Math.max(1, canvas.width / 800);
  context.lineWidth = 2 * unit;
  context.font = `bold ${Math.round(14 * unit)}px sans-serif`;
  const accent = readThemeColor('primary');
  const onAccent = readThemeColor('primary-foreground');
  for (const mark of marks) {
    const rect = mark.anchor.rect;
    if (rect?.length !== 4) continue;
    const [x, y, w, h] = [
      rect[0] * canvas.width,
      rect[1] * canvas.height,
      rect[2] * canvas.width,
      rect[3] * canvas.height,
    ];
    context.strokeStyle = accent;
    context.strokeRect(x, y, w, h);
    const badge = Math.max(34 * unit, context.measureText(mark.label).width + 14 * unit);
    context.fillStyle = accent;
    context.fillRect(x, Math.max(0, y - 24 * unit), badge, 24 * unit);
    context.fillStyle = onAccent;
    context.fillText(mark.label, x + 7 * unit, Math.max(17 * unit, y - 7 * unit));
  }
  return canvas.toDataURL('image/png');
}

function cropPng(image: HTMLImageElement, rect: readonly number[]): string {
  const canvas = document.createElement('canvas');
  const sx = rect[0]! * image.naturalWidth;
  const sy = rect[1]! * image.naturalHeight;
  canvas.width = Math.max(1, Math.round(rect[2]! * image.naturalWidth));
  canvas.height = Math.max(1, Math.round(rect[3]! * image.naturalHeight));
  canvas
    .getContext('2d')
    ?.drawImage(image, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** The images of a send: the overview from the newest snapshot, and each mark's own crop. */
export async function appViewImages(
  marks: readonly DraftMark[],
  captures: ReadonlyMap<string, Capture>,
): Promise<CommentAttachment['images']> {
  const images: NonNullable<CommentAttachment['images']> = [];
  const shot = [...marks]
    .reverse()
    .map((mark) => captures.get(mark.label)?.snapshot)
    .find((snapshot) => snapshot && 'image' in snapshot);
  if (!shot || !('image' in shot)) return images;
  images.push({ data: await overviewPng(await loadImage(shot.image), marks) });
  for (const mark of marks) {
    const snapshot = captures.get(mark.label)?.snapshot;
    if (!snapshot || !('image' in snapshot) || mark.anchor.rect?.length !== 4) continue;
    images.push({
      label: mark.label,
      data: cropPng(await loadImage(snapshot.image), mark.anchor.rect),
    });
  }
  return images;
}
