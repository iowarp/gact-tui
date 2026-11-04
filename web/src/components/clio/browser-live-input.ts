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

export const BUTTONS = ['left', 'middle', 'right'] as const;

/** What a key press sends: printable characters as text, everything else as a key. */
export function keyInput(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): BrowserInput {
  const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
  if (printable) return { type: 'text', text: event.key };
  const modifiers = [event.ctrlKey && 'Control', event.metaKey && 'Meta', event.altKey && 'Alt']
    .filter(Boolean)
    .join('+');
  return { type: 'key', action: 'press', key: modifiers ? `${modifiers}+${event.key}` : event.key };
}

