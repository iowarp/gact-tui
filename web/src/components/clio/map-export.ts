/**
 * Map download (G0): PNG via the maplibre canvas's own `toBlob` — mirrors
 * `chart-export.ts`'s approach for a Vega chart's `View`. Unlike Vega, which
 * exposes `toImageURL`/`toCanvas` on its own `View` object,
 * `ClioScientificMapView`'s renderer is maplibre-gl's WebGL canvas itself
 * (`map.getCanvas()`), read directly.
 *
 * Reads the canvas from inside a `map.once('render', ...)` callback, right
 * after a frame it forced with `map.triggerRepaint()` -- NOT with
 * `canvasContextAttributes: { preserveDrawingBuffer: true }` on the `<Map>`
 * (#516 review item 14): that flag keeps every frame's backbuffer around
 * instead of letting the GPU discard it immediately after compositing, which
 * is a real, standing memory/performance cost (maplibre's own docs warn
 * against it) paid on every frame for the sake of the rare PNG export. Reading
 * the canvas synchronously inside the render callback sees the just-painted
 * frame before the browser clears it, with no standing cost otherwise.
 */

interface RepaintableMap {
  getCanvas(): HTMLCanvasElement;
  once(type: 'render', listener: () => void): unknown;
  triggerRepaint(): void;
}

/** The map's current rendering as a PNG `Blob`. */
export function mapPngBlob(map: RepaintableMap): Promise<Blob> {
  return new Promise((resolve, reject) => {
    map.once('render', () => {
      map.getCanvas().toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG export failed: canvas returned no image data.'));
      }, 'image/png');
    });
    map.triggerRepaint();
  });
}
