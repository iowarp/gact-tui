import type { DocumentAnchor } from '@clio/core/v3';
import type { Rect } from './comment-region-layer';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clientBox(rect: Rect, host: HTMLElement): Box {
  const box = host.getBoundingClientRect();
  return {
    left: box.left + rect[0] * box.width,
    top: box.top + rect[1] * box.height,
    width: rect[2] * box.width,
    height: rect[3] * box.height,
  };
}

function overlap(a: Box, b: DOMRect): number {
  const width = Math.min(a.left + a.width, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/** ``box`` normalized to ``target`` and clipped to it, or undefined when they do not meet. */
function normalized(box: Box, target: DOMRect): number[] | undefined {
  const left = Math.max(box.left, target.left);
  const top = Math.max(box.top, target.top);
  const right = Math.min(box.left + box.width, target.right);
  const bottom = Math.min(box.top + box.height, target.bottom);
  if (right - left < 2 || bottom - top < 2) return undefined;
  return [
    (left - target.left) / target.width,
    (top - target.top) / target.height,
    (right - left) / target.width,
    (bottom - top) / target.height,
  ];
}

/** A region dragged over a PDF viewer, on the page it covers most (page and rectangle). */
export function pdfRegionAnchor(rect: Rect, host: HTMLElement): DocumentAnchor | undefined {
  const box = clientBox(rect, host);
  let best: { page: HTMLElement; area: number } | undefined;
  for (const page of host.querySelectorAll<HTMLElement>('[data-page]')) {
    const area = overlap(box, page.getBoundingClientRect());
    if (area > (best?.area ?? 0)) best = { page, area };
  }
  if (!best) return undefined;
  const area = best.page.querySelector('canvas') ?? best.page;
  const normal = normalized(box, area.getBoundingClientRect());
  if (!normal) return undefined;
  return { profile: 'region', page_index: Number(best.page.dataset.page), rect: normal };
}

/** A region dragged over an image viewer, on the image itself (natural size kept). */
export function imageRegionAnchor(rect: Rect, host: HTMLElement): DocumentAnchor | undefined {
  const image = host.querySelector<HTMLImageElement>('img');
  if (!image) return undefined;
  const normal = normalized(clientBox(rect, host), image.getBoundingClientRect());
  if (!normal) return undefined;
  return {
    profile: 'region',
    rect: normal,
    natural_width: image.naturalWidth || undefined,
    natural_height: image.naturalHeight || undefined,
  };
}
