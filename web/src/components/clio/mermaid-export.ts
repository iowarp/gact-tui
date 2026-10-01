/**
 * Mermaid/workflow diagram export (G0): the rendered diagram's own sanitized
 * SVG markup (`ClioMermaidDiagram`'s `svgOutput`, produced by
 * `mermaidcn/mermaid-preview.tsx` and already sanitized there via
 * `sanitizeMermaidSvg`) rasterized to PNG entirely client-side — no server
 * route, since a diagram has no artifact table to export through.
 *
 * `svgToPngBlob` is a pure function: it takes the SVG markup and the pixel
 * size to rasterize at, rather than reading a live DOM node, so it is easy to
 * unit test with a tiny inline SVG string and the canvas-mocking pattern
 * `chart-export.test.ts` uses. Sizing is resolved separately by
 * `svgIntrinsicSize` (also pure, from the SVG's own `viewBox`) so the caller
 * decides what to do when a diagram's SVG has none (mermaid's own output
 * always sets one, but a hand-authored or future SVG source might not).
 */

/** Output pixels per SVG unit — a crisper raster than the SVG's own CSS size. */
const PNG_EXPORT_SCALE = 2;

/** The SVG root's own intrinsic size, read from its `viewBox` attribute. */
export function svgIntrinsicSize(svg: string): { width: number; height: number } | undefined {
  const viewBox = /<svg\b[^>]*\bviewBox="([^"]+)"/u.exec(svg)?.[1];
  const values = viewBox?.trim().split(/\s+/u).map(Number);
  if (values?.length !== 4 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) {
    return undefined;
  }
  return { width: values[2], height: values[3] };
}

/** Loads `svgMarkup` into an `<img>` via a data URI (no network fetch, no Blob URL to revoke). */
function loadSvgImage(svgMarkup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('the diagram SVG could not be loaded for export.'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  });
}

/**
 * Rasterizes `svgMarkup` to a PNG `Blob`, composited onto an opaque white
 * background — an SVG's transparency would otherwise become undefined canvas
 * pixels, the same reasoning as `chart-export.ts`'s `chartJpegBlob`.
 * `width`/`height` are the SVG's own natural size (see `svgIntrinsicSize`);
 * the output canvas is scaled up by `PNG_EXPORT_SCALE` for a sharper image.
 */
export async function svgToPngBlob(svgMarkup: string, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * PNG_EXPORT_SCALE));
  canvas.height = Math.max(1, Math.round(height * PNG_EXPORT_SCALE));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas 2D context is unavailable in this browser.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const image = await loadSvgImage(svgMarkup);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed.'))),
      'image/png',
    );
  });
}
