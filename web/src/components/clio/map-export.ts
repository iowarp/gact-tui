/**
 * Map download (G0): PNG via the maplibre canvas's own `toBlob` — mirrors
 * `chart-export.ts`'s approach for a Vega chart's `View`. Unlike Vega, which
 * exposes `toImageURL`/`toCanvas` on its own `View` object,
 * `ClioScientificMapView`'s renderer is maplibre-gl's WebGL canvas itself
 * (`map.getCanvas()`), read directly.
 *
 * `canvasContextAttributes: { preserveDrawingBuffer: true }` is set on the
 * `<Map>` in `scientific-map-view.tsx` for this to work reliably: a WebGL
 * canvas's backbuffer is cleared after each paint by default, so
 * `toBlob`/`toDataURL` on it can otherwise read back a blank image depending
 * on exactly when the browser composites the frame.
 */

/** The map's current rendering as a PNG `Blob`. */
export function mapPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG export failed.'));
    }, 'image/png');
  });
}
