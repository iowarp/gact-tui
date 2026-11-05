import type { KeyboardEvent } from 'react';
import type { BrowserInput } from './browser-live-socket';

export interface Viewport {
  width: number;
  height: number;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where a point on the shown frame lands on the page, in page CSS pixels, or `null` when
 * it falls on the letterbox around the frame. The frame keeps the page's aspect inside
 * its box (`object-contain`), so the page area is centred and scaled to fit.
 */
export function pagePoint(
  clientX: number,
  clientY: number,
  box: Box,
  viewport: Viewport,
): { x: number; y: number } | null {
  if (!viewport.width || !viewport.height || !box.width || !box.height) return null;
  const scale = Math.min(box.width / viewport.width, box.height / viewport.height);
  const shownWidth = viewport.width * scale;
  const shownHeight = viewport.height * scale;
  const left = box.left + (box.width - shownWidth) / 2;
  const top = box.top + (box.height - shownHeight) / 2;
  const x = (clientX - left) / scale;
  const y = (clientY - top) / scale;
  if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) return null;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

/**
 * A rectangle drawn over the view (normalized to `box`) as a rectangle of the page's view
 * (normalized to `viewport`), clipped to the shown frame, or `null` when it misses it.
 */
export function frameRect(
  rect: readonly [number, number, number, number],
  box: Box,
  viewport: Viewport,
): [number, number, number, number] | null {
  if (!viewport.width || !viewport.height || !box.width || !box.height) return null;
  const scale = Math.min(box.width / viewport.width, box.height / viewport.height);
  const left = (box.width - viewport.width * scale) / 2;
  const top = (box.height - viewport.height * scale) / 2;
  const toX = (value: number) =>
    Math.min(1, Math.max(0, (value * box.width - left) / scale / viewport.width));
  const toY = (value: number) =>
    Math.min(1, Math.max(0, (value * box.height - top) / scale / viewport.height));
  const x = toX(rect[0]);
  const y = toY(rect[1]);
  const width = toX(rect[0] + rect[2]) - x;
  const height = toY(rect[1] + rect[3]) - y;
  if (width * viewport.width < 2 || height * viewport.height < 2) return null;
  return [x, y, width, height];
}

export const BUTTONS = ['left', 'middle', 'right'] as const;

/** What a key press sends: printable characters as text, everything else as a key. */
export function keyInput(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
): BrowserInput {
  const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
  if (printable) return { type: 'text', text: event.key };
  const modifiers = [event.ctrlKey && 'Control', event.metaKey && 'Meta', event.altKey && 'Alt']
    .filter(Boolean)
    .join('+');
  return { type: 'key', action: 'press', key: modifiers ? `${modifiers}+${event.key}` : event.key };
}
