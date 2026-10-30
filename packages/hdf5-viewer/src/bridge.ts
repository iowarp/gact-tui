import {
  AbortError,
  hasArrayShape,
  hasNumericType,
  type Fetcher,
  type GetExportURL,
} from '@h5web/app';
import {
  H5GROVE_ENDPOINTS,
  VIEWER_SOURCE,
  isHostMessage,
  type H5GroveEndpoint,
  type HostMessage,
  type ViewerMessage,
} from './protocol';

type Pending = { resolve: (body: ArrayBuffer) => void; reject: (error: unknown) => void };

/**
 * Sends viewer messages to the host and routes its replies.
 *
 * `fetcher` has h5web's `Fetcher` shape, so `H5GroveProvider` uses it in place
 * of HTTP: each request becomes a `fetch` message and resolves with the
 * host's `response`.
 */
export class HostBridge {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly host: Pick<Window, 'postMessage'>,
    private readonly hostOrigin: string,
  ) {}

  post(message: ViewerMessage): void {
    this.host.postMessage(message, this.hostOrigin);
  }

  /** Handle a host message; returns the `init` message for the caller to apply. */
  receive(data: unknown): Extract<HostMessage, { type: 'init' }> | undefined {
    if (!isHostMessage(data)) return undefined;
    if (data.type === 'init') return data;
    const pending = this.pending.get(data.id);
    if (!pending) return undefined;
    this.pending.delete(data.id);
    if (data.ok) pending.resolve(data.body);
    else pending.reject(new Error(data.message || `Request failed: ${data.status}`));
    return undefined;
  }

  readonly fetcher: Fetcher = (url, params, opts = {}) => {
    const endpoint = endpointOf(url);
    const { abortSignal } = opts;
    if (abortSignal?.aborted) return Promise.reject(abortReason(abortSignal));

    const id = this.nextId++;
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const onAbort = () => {
        this.pending.delete(id);
        this.post({ source: VIEWER_SOURCE, type: 'abort', id });
        reject(abortReason(abortSignal));
      };
      abortSignal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, {
        resolve: (body) => {
          abortSignal?.removeEventListener('abort', onAbort);
          resolve(body);
        },
        reject: (error) => {
          abortSignal?.removeEventListener('abort', onAbort);
          reject(error);
        },
      });
      this.post({ source: VIEWER_SOURCE, type: 'fetch', id, endpoint, params });
    });
  };
}

/**
 * Export through the host, like every other read.
 *
 * h5web's default builds `new URL('/data?...')` from the provider's base URL,
 * which is empty here (the iframe has no service address), so it throws.
 * Built-in exports (CSV, JSON) are produced in the page; NumPy and TIFF come
 * from h5grove's `/data` endpoint as a Blob.
 */
export function createExportURL(fetcher: Fetcher, filepath: string): GetExportURL {
  return (format, dataset, selection, builtInExporter) => {
    if (builtInExporter) return async () => new Blob([builtInExporter()]);
    // Same offer as h5web's own: binary exports of numeric arrays only.
    if (format !== 'npy' && format !== 'tiff') return undefined;
    if (!hasArrayShape(dataset) || !hasNumericType(dataset)) return undefined;
    const params: Record<string, string> = { file: filepath, path: dataset.path, format };
    if (selection) params.selection = selection;
    return async () => new Blob([await fetcher('/data', params)]);
  };
}

/** `H5GroveProvider` is given an empty base URL, so `url` is `/meta`, `/data`, ... */
export function endpointOf(url: string): H5GroveEndpoint {
  const name = url.replace(/^.*\//u, '');
  if ((H5GROVE_ENDPOINTS as readonly string[]).includes(name)) return name as H5GroveEndpoint;
  throw new Error(`Unsupported h5grove endpoint: ${url}`);
}

/** h5web expects its own AbortError back when it cancels a request. */
function abortReason(signal: AbortSignal | undefined): unknown {
  return signal?.reason instanceof AbortError ? signal.reason : new AbortError();
}

/**
 * Report the explorer's selected path whenever it changes.
 *
 * h5web's `App` exposes no selection callback, so this watches the tree items
 * it renders (`role="treeitem"` with `aria-selected` and `data-path`). It
 * reports nothing while the sidebar is closed, because the tree is unmounted.
 */
export function observeSelection(root: Element, onSelect: (locator: string) => void): () => void {
  let last: string | undefined;
  const check = () => {
    const selected = root.querySelector('[role="treeitem"][aria-selected="true"][data-path]');
    const locator = selected?.getAttribute('data-path') ?? undefined;
    if (locator !== undefined && locator !== last) {
      last = locator;
      onSelect(locator);
    }
  };
  const observer = new MutationObserver(check);
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-selected'],
  });
  check();
  return () => observer.disconnect();
}
