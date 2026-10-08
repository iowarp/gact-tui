/**
 * Generic, renderer-owned export helpers shared by every data-view component
 * (G0: "built-in data-view affordances, owned by the renderer" -- download is
 * produced by the client renderer or a server route, never agent code).
 *
 * `surface-toolbar.tsx` renders the format menu; this module does the actual
 * work a format's `run()` callback performs: naming the file from the
 * component's own title, triggering the browser download, and building a
 * portable CSV/JSON for inline (non-`dataUri`) rows, which have no server
 * route to export through.
 */

import { toast } from 'sonner';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { openDownloads } from '@/tauri/downloads';

const DEFAULT_FILENAME_BASE = 'export';
/** Characters kept as-is in a derived filename; everything else becomes `_`. */
const SAFE_FILENAME_CHARS = /[^a-z0-9._-]+/giu;

/** A component's title, as a short, safe filename stem (no extension). */
export function filenameStemFromTitle(title: string | undefined): string {
  const trimmed = (title ?? '').trim();
  if (!trimmed) return DEFAULT_FILENAME_BASE;
  const slug = trimmed
    .replaceAll(SAFE_FILENAME_CHARS, '_')
    .replaceAll(/_+/gu, '_')
    .replace(/^_|_$/gu, '');
  return slug || DEFAULT_FILENAME_BASE;
}

/** Triggers a browser "Save as" for `blob`, named `filename`. No server round trip. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    downloadUrl(url, filename);
  } finally {
    // Revoked after the click has had a chance to start the download (a
    // same-tick revoke can race the browser's own read of the object URL).
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

/**
 * `downloadBlob`, for a URL already in hand (e.g. a `blob:` URL a reference
 * resolver already built) — skips minting a second object URL for bytes that
 * already have one.
 */
export function downloadUrl(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  if (inTauri()) void openDownloads().catch((error: Error) => toast.error(error.message));
}

/** `downloadBlob`, for bytes already in hand (a fetched export, a canvas export, ...). */
export function downloadBytes(
  data: BlobPart | Uint8Array,
  mimeType: string,
  filename: string,
): void {
  // `Uint8Array`'s newer generic typing (`Uint8Array<ArrayBufferLike>`) is not
  // structurally a `BlobPart` (which wants an `ArrayBuffer`-only view); `Blob`
  // accepts it fine at runtime (it always has, for any typed array), so this
  // is a type-level cast only.
  downloadBlob(new Blob([data as BlobPart], { type: mimeType }), filename);
}

/** `downloadBlob`, for plain text (an SVG document, Mermaid/workflow source, a diff). */
export function downloadText(text: string, mimeType: string, filename: string): void {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A portable CSV of `rows`, projected to `columns` in that order. Client-side only: for INLINE data (no server to export through). */
export function rowsToCsv(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  const header = columns.map(csvCell).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(','));
  return [header, ...body].join('\r\n');
}

/** A portable, row-oriented JSON array of `rows`, projected to `columns`. Client-side only, for inline data. */
export function rowsToJson(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  const projected = rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column, row[column] ?? null])),
  );
  return JSON.stringify(projected, null, 2);
}

/** Whether a CSS `background-color` computed value paints nothing (transparent, or `rgba(...,0)`). */
function isTransparentColor(color: string): boolean {
  if (!color || color === 'transparent') return true;
  const alpha = /^rgba?\([^)]*,\s*([\d.]+)\s*\)$/u.exec(color)?.[1];
  return alpha !== undefined && Number(alpha) === 0;
}

/**
 * The nearest actual (non-transparent) background color behind `node`, by
 * walking up its own ancestors -- the real color a viewer's eye would see
 * behind the component, not an assumption about which element happens to set
 * it. Falls back to the document's own background, then white, so an export
 * composited onto this is never accidentally transparent (#516 review item
 * 13: a dark theme's light-colored chart text is unreadable once exported
 * transparent onto a typical white viewer).
 */
export function resolveCardBackground(node: Element | null): string {
  for (let current = node; current; current = current.parentElement) {
    const color = getComputedStyle(current).backgroundColor;
    if (!isTransparentColor(color)) return color;
  }
  const documentBackground = getComputedStyle(document.documentElement).backgroundColor;
  return isTransparentColor(documentBackground) ? '#ffffff' : documentBackground;
}

/** Copies text after a user gesture, including on local HTTP previews without the async Clipboard API. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Local HTTP previews can expose a clipboard object yet reject writeText.
  }
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  try {
    field.focus();
    field.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    previousFocus?.focus();
  }
}
