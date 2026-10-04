import type { ContentSelection } from '@clio/core/v3';
import { z } from 'zod';

const zone = z.object({
  dataUri: z.string().optional(),
  selection: z.object({
    field: z.string().min(1),
    values: z
      .array(z.union([z.string(), z.number().finite()]))
      .min(1)
      .max(1000),
  }),
});

/** Use stable source field/value keys, never visible row offsets or sampled previews. */
export function structuredAttentionSelection(
  surfaceId: string,
  componentId: string,
  query: unknown,
): Extract<ContentSelection['selection'], { kind?: 'structured' }> {
  const parsed = zone.safeParse(query);
  if (!parsed.success) throw new Error('Select up to 1000 data rows or points in this view first.');
  const keys = [
    ...new Set(
      parsed.data.selection.values.map((value) =>
        JSON.stringify([parsed.data.selection.field, value]),
      ),
    ),
  ].sort();
  const [first, ...rest] = keys;
  if (first === undefined) throw new Error('Select a data row or point first.');
  return {
    kind: 'structured',
    surface_id: surfaceId,
    component_id: componentId,
    source_ref: parsed.data.dataUri || `a2ui://${surfaceId}/${componentId}`,
    keys: [first, ...rest],
  };
}

/** Convert a viewport box to actual image coordinates, excluding object-fit letterboxing. */
export function imageAttentionRegion(
  image: HTMLImageElement,
  target: HTMLElement,
  region: { x: number; y: number; width: number; height: number },
): Extract<ContentSelection['selection'], { kind?: 'image_region' }> {
  const rect = image.getBoundingClientRect();
  const bounds = target.getBoundingClientRect();
  if (!image.naturalWidth || !image.naturalHeight || !rect.width || !rect.height)
    throw new Error('The image has not finished loading.');
  const style = getComputedStyle(image);
  if (!['50% 50%', 'center center', ''].includes(style.objectPosition))
    throw new Error('This image uses an unsupported crop position. Open its original view first.');
  const fit = style.objectFit || 'fill';
  let width = rect.width;
  let height = rect.height;
  if (fit !== 'fill') {
    const contain = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    const scale =
      fit === 'cover'
        ? Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight)
        : fit === 'none'
          ? 1
          : fit === 'scale-down'
            ? Math.min(1, contain)
            : contain;
    width = image.naturalWidth * scale;
    height = image.naturalHeight * scale;
  }
  const left = rect.left + (rect.width - width) / 2;
  const top = rect.top + (rect.height - height) / 2;
  const x1 = Math.max(left, rect.left, bounds.left + region.x * bounds.width);
  const y1 = Math.max(top, rect.top, bounds.top + region.y * bounds.height);
  const x2 = Math.min(
    left + width,
    rect.right,
    bounds.left + (region.x + region.width) * bounds.width,
  );
  const y2 = Math.min(
    top + height,
    rect.bottom,
    bounds.top + (region.y + region.height) * bounds.height,
  );
  if (x2 <= x1 || y2 <= y1) throw new Error('Select a region inside the image pixels.');
  const x = Math.max(0, (x1 - left) / width),
    y = Math.max(0, (y1 - top) / height);
  return {
    kind: 'image_region',
    x,
    y,
    width: Math.min(1 - x, (x2 - x1) / width),
    height: Math.min(1 - y, (y2 - y1) / height),
  };
}
