import type { View } from 'vega';

/**
 * Chart download (G0): PNG/SVG via the Vega `View` itself, JPG via canvas
 * compositing (JPEG has no alpha channel, so it needs an opaque background a
 * transparent-background chart does not otherwise have). `chart-embed.ts`
 * sets `actions: false` to remove Vega's own export menu (it would otherwise
 * duplicate this, with none of the renderer's own naming/CSV affordances),
 * but the embedded `View` object still exposes these APIs programmatically —
 * only the UI chrome was removed.
 *
 * `chart-embed.ts` always embeds with `config: { background: 'transparent' }`
 * (so the chart blends into its own card on screen, in either theme) — an
 * export must NOT inherit that: a transparent PNG opened on a plain white
 * viewer loses a dark theme's light-colored axis/text entirely, and a
 * hardcoded white JPEG background does the same under dark-theme text. Every
 * export here paints the component's own CURRENT card background in first
 * (#516 review item 13), and renders at the device's own pixel ratio so a
 * HiDPI screen's export is not visibly blurrier than what was on screen.
 */

type ExportableView = Pick<View, 'background' | 'toCanvas' | 'toImageURL' | 'toSVG'>;

function devicePixelRatioOrOne(): number {
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
}

/** Runs `render` with the view's background temporarily set to `background`, always restoring the view's own (transparent, on-screen) setting afterward -- even if `render` throws. */
async function withOpaqueBackground<T>(
  view: ExportableView,
  background: string,
  render: () => Promise<T>,
): Promise<T> {
  const original = view.background();
  view.background(background);
  try {
    return await render();
  } finally {
    view.background(original);
  }
}

/**
 * The chart's current rendering as a PNG `Blob`, composited onto `background`
 * (the component's own card background -- never left transparent) and
 * rendered at the device's own pixel ratio.
 */
export async function chartPngBlob(view: ExportableView, background: string): Promise<Blob> {
  const url = await withOpaqueBackground(view, background, () =>
    view.toImageURL('png', devicePixelRatioOrOne()),
  );
  const response = await fetch(url);
  return response.blob();
}

/**
 * The chart's current rendering as a JPEG `Blob`, composited onto `background`
 * (the component's own card background, not a hardcoded white that would
 * hide dark-theme text) and rendered at the device's own pixel ratio.
 */
export async function chartJpegBlob(view: ExportableView, background: string): Promise<Blob> {
  const source = await withOpaqueBackground(view, background, () =>
    view.toCanvas(devicePixelRatioOrOne()),
  );
  const opaque = document.createElement('canvas');
  opaque.width = source.width;
  opaque.height = source.height;
  const context = opaque.getContext('2d');
  if (!context) throw new Error('canvas 2D context is unavailable in this browser.');
  // Vega's own canvas renderer already painted `background` behind the marks
  // (set above), but a JPEG has no alpha channel at all regardless of what
  // the source canvas reports, so this still composites explicitly onto its
  // own opaque surface rather than trusting the source canvas's own fill.
  context.fillStyle = background;
  context.fillRect(0, 0, opaque.width, opaque.height);
  context.drawImage(source, 0, 0);
  return new Promise((resolve, reject) => {
    opaque.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('JPEG export failed: canvas returned no image data.'))),
      'image/jpeg',
      0.92,
    );
  });
}

/** The chart's current rendering as standalone SVG markup. */
export async function chartSvgText(view: ExportableView): Promise<string> {
  return view.toSVG();
}
