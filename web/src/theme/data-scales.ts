/**
 * Perceptual colormaps for scientific rasters. They encode data values, not
 * the interface, so they are the same in every theme. Elements that draw them
 * carry `data-theme-exempt="data-scale"` so the Debug theme audit skips them.
 */
export type Colormap =
  | 'viridis'
  | 'magma'
  | 'plasma'
  | 'cividis'
  | 'turbo'
  | 'grayscale'
  | 'balance';

export const COLORMAP_STOPS: Record<Colormap, readonly [string, string, string, string, string]> = {
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  magma: ['#000004', '#51127c', '#b73779', '#fc8961', '#fcfdbf'],
  plasma: ['#0d0887', '#7e03a8', '#cb4679', '#f89441', '#f0f921'],
  cividis: ['#00204c', '#424e6c', '#7c7b78', '#bba774', '#ffea46'],
  turbo: ['#30123b', '#3e9eca', '#9cd93b', '#f99b21', '#7a0403'],
  grayscale: ['#161616', '#4d4d4d', '#858585', '#bdbdbd', '#f5f5f5'],
  // Diverging, for anomalies and biases: the middle stop is zero.
  balance: ['#2166ac', '#92c5de', '#f7f7f7', '#f4a582', '#b2182b'],
};

/** Marks an element whose colors are a data encoding rather than the theme. */
/** The colour at `fraction` (0..1) along a ramp, as RGB bytes. */
export function colormapRgb(map: Colormap, fraction: number): [number, number, number] {
  const stops = COLORMAP_STOPS[map];
  const scaled =
    Math.max(0, Math.min(0.9999, Number.isFinite(fraction) ? fraction : 0)) * (stops.length - 1);
  const index = Math.floor(scaled);
  const position = scaled - index;
  const from = stops[index]!;
  const to = stops[index + 1]!;
  return [1, 3, 5].map((offset) => {
    const a = Number.parseInt(from.slice(offset, offset + 2), 16);
    const b = Number.parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * position);
  }) as [number, number, number];
}

/** A ramp as a CSS gradient, for legends. */
export function colormapGradient(map: Colormap, direction = 'to right'): string {
  return `linear-gradient(${direction}, ${COLORMAP_STOPS[map].join(', ')})`;
}

export const DATA_SCALE_EXEMPTION = { 'data-theme-exempt': 'data-scale' } as const;
