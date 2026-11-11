import type { CommentAttachment } from '@clio/core/v3';
import {
  displayedRegion,
  regionSource,
  type CaptureSurface,
  type CaptureTarget,
  type Region,
} from '../a2ui-region-evidence';

type LabelledPng = (
  target: HTMLElement,
  regions: readonly Region[],
  pixelRatio?: number,
) => Promise<Blob>;

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The capture could not be read.'));
    reader.readAsDataURL(blob);
  });
}

function canvasDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blobDataUrl(blob)) : reject(new Error('The crop returned no PNG data.')),
      'image/png',
    ),
  );
}

/**
 * One A2UI select session as a comment-session attachment. The browser draws its images,
 * since the surface lives only in the client (addendum A, section 3): the labelled
 * overview, then a crop per box, at twice the pixel density. Each mark carries the surface
 * context and the readable lines under its box (``regionSource``), never a JSON block.
 */
export async function a2uiAttachment(
  surface: CaptureSurface,
  target: CaptureTarget,
  regions: readonly Region[],
  labelledPng: LabelledPng,
): Promise<CommentAttachment> {
  const overview = await labelledPng(target.element, regions, 2);
  const whole = await createImageBitmap(await labelledPng(target.element, [], 2));
  try {
    const crops = await Promise.all(
      regions.map(async (region) => {
        const shown = displayedRegion(target.element, region);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(shown.width * whole.width));
        canvas.height = Math.max(1, Math.round(shown.height * whole.height));
        canvas
          .getContext('2d')
          ?.drawImage(
            whole,
            shown.x * whole.width,
            shown.y * whole.height,
            canvas.width,
            canvas.height,
            0,
            0,
            canvas.width,
            canvas.height,
          );
        return { label: region.id, data: await canvasDataUrl(canvas) };
      }),
    );
    return {
      kind: 'a2ui-surface',
      title: target.title,
      marks: regions.map((region) => {
        const shown = displayedRegion(target.element, region);
        return {
          label: region.id,
          comment: region.comment,
          anchor: {
            profile: 'region',
            rect: [shown.x, shown.y, shown.width, shown.height],
            source: regionSource(surface, target, region),
          },
        };
      }),
      images: [{ data: await blobDataUrl(overview) }, ...crops],
    };
  } finally {
    whole.close();
  }
}
