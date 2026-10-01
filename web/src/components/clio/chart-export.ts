import type { View } from 'vega';

/**
 * Chart download (G0): PNG/SVG via the Vega `View` itself, JPG via canvas
 * compositing (JPEG has no alpha channel, so it needs an opaque background a
 * transparent-background chart does not otherwise have). `chart-embed.ts`
 * sets `actions: false` to remove Vega's own export menu (it would otherwise
 * duplicate this, with none of the renderer's own naming/CSV affordances),
 * but the embedded `View` object still exposes these APIs programmatically —
 * only the UI chrome was removed.
 */

type ExportableView = Pick<View, 'toImageURL' | 'toSVG' | 'toCanvas'>;

/** The chart's current rendering as a PNG `Blob`. */
export async function chartPngBlob(view: ExportableView): Promise<Blob> {
  const url = await view.toImageURL('png');
  const response = await fetch(url);
  return response.blob();
}

/** The chart's current rendering as a JPEG `Blob`, composited onto an opaque white background. */
export async function chartJpegBlob(view: ExportableView): Promise<Blob> {
  const source = await view.toCanvas();
  const opaque = document.createElement('canvas');
  opaque.width = source.width;
  opaque.height = source.height;
  const context = opaque.getContext('2d');
  if (!context) throw new Error('canvas 2D context is unavailable in this browser.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, opaque.width, opaque.height);
  context.drawImage(source, 0, 0);
  return new Promise((resolve, reject) => {
    opaque.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('JPEG export failed.'))),
      'image/jpeg',
      0.92,
    );
  });
}

/** The chart's current rendering as standalone SVG markup. */
export async function chartSvgText(view: ExportableView): Promise<string> {
  return view.toSVG();
}
