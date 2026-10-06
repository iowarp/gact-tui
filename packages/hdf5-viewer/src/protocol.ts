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
  | { source: typeof VIEWER_SOURCE; type: 'select'; locator: string };

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
    }
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
        (value.locator === undefined || typeof value.locator === 'string')
      );
    case 'response':
      return (
        typeof value.id === 'number' &&
        (value.ok === true
          ? value.body instanceof ArrayBuffer
          : typeof value.status === 'number' && typeof value.message === 'string')
      );
    default:
      return false;
  }
}
