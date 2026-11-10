/**
 * Messages between the HDF5 viewer iframe and the page that hosts it.
 *
 * The viewer runs h5web, which needs React 18, so it lives in its own page and
 * React tree. It has no network access of its own: every h5grove request goes
 * to the host as a `fetch` message, and the host answers it through its own
 * authenticated transport. This keeps tokens and the service address out of
 * the iframe and works the same over the browser and desktop transports.
 *
 * The host-facing contract (`init` in, `select` out) is the viewer slot the
 * CLIO structured-files RFC describes as `<Viewer fileId locator onSelect />`.
 */

export const HDF5_VIEWER_PROTOCOL = 1;

export const VIEWER_SOURCE = 'clio-hdf5-viewer';
export const HOST_SOURCE = 'clio-hdf5-host';

/** h5grove endpoints the viewer may ask the host to call. */
export const H5GROVE_ENDPOINTS = ['meta', 'attr', 'data', 'stats', 'paths'] as const;
export type H5GroveEndpoint = (typeof H5GROVE_ENDPOINTS)[number];

export type ViewerMessage =
  | { source: typeof VIEWER_SOURCE; type: 'ready'; protocol: number }
  | {
      source: typeof VIEWER_SOURCE;
      type: 'fetch';
      id: number;
      endpoint: H5GroveEndpoint;
      params: Record<string, string>;
    }
  | { source: typeof VIEWER_SOURCE; type: 'abort'; id: number }
  | { source: typeof VIEWER_SOURCE; type: 'select'; locator: string }
  | {
      source: typeof VIEWER_SOURCE;
      type: 'entity';
      locator: string;
      kind: 'dataset' | 'group' | 'other';
      /** A dataset's dimensions; empty for a scalar. */
      shape?: number[];
      /** A dataset's element type in numpy terms, e.g. `float32`. */
      dtype?: string;
    }
  | {
      source: typeof VIEWER_SOURCE;
      type: 'modes';
      /** The ways the current object can be shown. */
      modes: Hdf5Mode[];
      mode?: Hdf5Mode;
      /** Whether the object tree is open. */
      explorer: boolean;
    };

/**
 * How the viewer shows the current object. The host draws these in its own
 * frame, so the viewer's breadcrumb bar and visualization tabs stay hidden.
 */
export const HDF5_MODES = ['table', 'plot', 'image', 'attributes'] as const;
export type Hdf5Mode = (typeof HDF5_MODES)[number];

/**
 * The host theme's colors, as `#rrggbb`, that the viewer paints h5web's
 * chrome with so the tree and tables read as part of the workbench.
 */
export const HDF5_PALETTE_KEYS = [
  'background',
  'foreground',
  'muted',
  'border',
  'hover',
  'selected',
  'accent',
] as const;
export type Hdf5Palette = Record<(typeof HDF5_PALETTE_KEYS)[number], string>;

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;

function isPalette(value: unknown): value is Hdf5Palette {
  return (
    isRecord(value) &&
    HDF5_PALETTE_KEYS.every((key) => typeof value[key] === 'string' && HEX_COLOR.test(value[key]))
  );
}

function isMode(value: unknown): value is Hdf5Mode {
  return (HDF5_MODES as readonly unknown[]).includes(value);
}

export type HostMessage =
  | {
      source: typeof HOST_SOURCE;
      type: 'init';
      protocol: number;
      /** File name shown in the viewer's breadcrumbs. */
      filepath: string;
      /** Object to open first; the file root when absent. */
      locator?: string;
      /** Bumped when the file changes, so cached reads are dropped. */
      revision: number;
      /** The host's theme. Absent: the viewer follows the operating system. */
      theme?: 'light' | 'dark';
      /** The host theme's colors for the viewer's chrome. Absent: h5web's own. */
      palette?: Hdf5Palette;
    }
  /** Show the current object another way, or open or close the object tree. */
  | { source: typeof HOST_SOURCE; type: 'show'; mode?: Hdf5Mode; explorer?: boolean }
  | { source: typeof HOST_SOURCE; type: 'response'; id: number; ok: true; body: ArrayBuffer }
  | {
      source: typeof HOST_SOURCE;
      type: 'response';
      id: number;
      ok: false;
      status: number;
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isViewerMessage(value: unknown): value is ViewerMessage {
  if (!isRecord(value) || value.source !== VIEWER_SOURCE) return false;
  switch (value.type) {
    case 'ready':
      return typeof value.protocol === 'number';
    case 'fetch':
      return (
        typeof value.id === 'number' &&
        (H5GROVE_ENDPOINTS as readonly unknown[]).includes(value.endpoint) &&
        isRecord(value.params) &&
        Object.values(value.params).every((param) => typeof param === 'string')
      );
    case 'abort':
      return typeof value.id === 'number';
    case 'select':
      return typeof value.locator === 'string';
    case 'entity':
      return (
        typeof value.locator === 'string' &&
        (value.kind === 'dataset' || value.kind === 'group' || value.kind === 'other') &&
        (value.shape === undefined ||
          (Array.isArray(value.shape) && value.shape.every((dim) => typeof dim === 'number'))) &&
        (value.dtype === undefined || typeof value.dtype === 'string')
      );
    case 'modes':
      return (
        Array.isArray(value.modes) &&
        value.modes.every(isMode) &&
        (value.mode === undefined || isMode(value.mode)) &&
        typeof value.explorer === 'boolean'
      );
    default:
      return false;
  }
}

export function isHostMessage(value: unknown): value is HostMessage {
  if (!isRecord(value) || value.source !== HOST_SOURCE) return false;
  switch (value.type) {
    case 'init':
      return (
        typeof value.protocol === 'number' &&
        typeof value.filepath === 'string' &&
        typeof value.revision === 'number' &&
        (value.locator === undefined || typeof value.locator === 'string') &&
        (value.theme === undefined || value.theme === 'light' || value.theme === 'dark') &&
        (value.palette === undefined || isPalette(value.palette))
      );
    case 'response':
      return (
        typeof value.id === 'number' &&
        (value.ok === true
          ? value.body instanceof ArrayBuffer
          : typeof value.status === 'number' && typeof value.message === 'string')
      );
    case 'show':
      return (
        (value.mode === undefined || isMode(value.mode)) &&
        (value.explorer === undefined || typeof value.explorer === 'boolean')
      );
    default:
      return false;
  }
}
