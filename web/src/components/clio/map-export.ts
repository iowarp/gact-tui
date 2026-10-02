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
  once(type: 'render' | 'remove', listener: () => void): unknown;
  off?(type: 'render' | 'remove', listener: () => void): unknown;
  triggerRepaint(): void;
}

/** The map's current rendering as a PNG `Blob`. */
export function mapPngBlob(map: RepaintableMap): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = map.getCanvas();
    let settled = false;
    const cleanup = () => {
      map.off?.('render', onRender);
      map.off?.('remove', onRemove);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    const fail = (reason: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(reason));
    };
    const onRemove = () => fail('PNG export stopped because the map was closed.');
    const onContextLost = () =>
      fail('PNG export stopped because the map graphics context was lost.');
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden')
        fail('PNG export stopped because the page became hidden.');
    };
    const onRender = () => {
      if (settled) return;
      try {
        canvas.toBlob((blob) => {
          if (settled) return;
          if (!blob) {
            fail('PNG export failed: canvas returned no image data.');
            return;
          }
          settled = true;
          cleanup();
          resolve(blob);
        }, 'image/png');
      } catch (error) {
        fail(`PNG export failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    if (document.visibilityState === 'hidden') {
      fail('PNG export is unavailable while the page is hidden.');
      return;
    }
    canvas.addEventListener('webglcontextlost', onContextLost);
    document.addEventListener('visibilitychange', onVisibilityChange);
    map.once('remove', onRemove);
    map.once('render', onRender);
    try {
      map.triggerRepaint();
    } catch (error) {
      fail(`PNG export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}
