/**
 * What "In a browser tab" may hand the browser for a file the app does not route to the
 * shared browser.
 *
 * A `blob:` URL has the app's origin, so a blob the browser treats as a document (HTML,
 * XHTML, SVG, XML with an XHTML or SVG root, or an untyped blob the browser sniffs as
 * one) would run any script in the file on the app's origin. Only types a browser renders
 * without script are passed through. An SVG is shown as an image inside a page that allows
 * no script. Anything else opens as plain text.
 */

/** Types a top-level browser tab renders without running anything the file contains. */
const INERT_TYPES = new Set([
  'application/pdf',
  'image/apng',
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/vnd.microsoft.icon',
  'image/webp',
  'image/x-icon',
]);

const SVG_PAGE_POLICY = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

function essence(mediaType: string): string {
  return (mediaType.split(';')[0] ?? '').trim().toLowerCase();
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}

/** The blob to open in a new tab for `bytes` of `mediaType`, typed so it cannot run script. */
export function browserTabBlob(bytes: Uint8Array, mediaType: string, name: string): Blob {
  const type = essence(mediaType);
  if (INERT_TYPES.has(type) || type.startsWith('audio/') || type.startsWith('video/'))
    return new Blob([bytes as BlobPart], { type });
  if (type === 'image/svg+xml') {
    // An SVG in <img> never runs script or loads anything; the page around it allows neither.
    const page =
      `<!doctype html><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="${SVG_PAGE_POLICY}">` +
      `<title>${escapeHtml(name)}</title>` +
      `<style>html,body{margin:0;height:100%}body{display:grid;place-items:center}` +
      `img{max-width:100%;max-height:100%}</style>` +
      `<img alt="${escapeHtml(name)}" src="data:image/svg+xml;base64,${base64(bytes)}">`;
    return new Blob([page], { type: 'text/html;charset=utf-8' });
  }
  return new Blob([bytes as BlobPart], { type: 'text/plain;charset=utf-8' });
}
