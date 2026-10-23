/**
 * Perceptual colormaps for scientific rasters. They encode data values, not
 * the interface, so they are the same in every theme. Elements that draw them
 * carry `data-theme-exempt="data-scale"` so the Debug theme audit skips them.
 */
export type Colormap = 'viridis' | 'magma' | 'plasma' | 'cividis' | 'turbo' | 'grayscale';

export const COLORMAP_STOPS: Record<Colormap, readonly [string, string, string, string, string]> = {
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  magma: ['#000004', '#51127c', '#b73779', '#fc8961', '#fcfdbf'],
  plasma: ['#0d0887', '#7e03a8', '#cb4679', '#f89441', '#f0f921'],
  cividis: ['#00204c', '#424e6c', '#7c7b78', '#bba774', '#ffea46'],
  turbo: ['#30123b', '#3e9eca', '#9cd93b', '#f99b21', '#7a0403'],
  grayscale: ['#161616', '#4d4d4d', '#858585', '#bdbdbd', '#f5f5f5'],
};

/** Marks an element whose colors are a data encoding rather than the theme. */
export const DATA_SCALE_EXEMPTION = { 'data-theme-exempt': 'data-scale' } as const;
