import { inTauri } from '@/lib/transport/tauri-runtime';

/** The viewer page's path, under the web app or under the desktop viewer origin. */
export const HDF5_VIEWER_PATH = 'hdf5-viewer/index.html';

/**
 * The scheme the desktop app serves viewer pages on (desktop/src-tauri/src/viewer_origin.rs).
 * h5web builds functions from strings, which the app's CSP forbids; the viewer
 * origin has its own policy that allows it.
 */
export const DESKTOP_VIEWER_SCHEME = 'gact-viewer';

export interface ViewerLocation {
  /** The iframe's `src`. */
  src: string;
  /** The viewer page's origin: where messages go, and the only origin accepted back. */
  origin: string;
}

/**
 * Where the viewer page loads from.
 *
 * @param hostOrigin This page's origin.
 * @param desktopBase The viewer scheme's base URL in a packaged desktop app
 *   (`gact-viewer://localhost/`, or `http://gact-viewer.localhost/` on Windows),
 *   otherwise undefined: the web app serves the viewer itself.
 */
export function viewerLocation(hostOrigin: string, desktopBase?: string): ViewerLocation {
  if (!desktopBase) return { src: `/${HDF5_VIEWER_PATH}`, origin: hostOrigin };
  // Strip the trailing slash rather than use URL.origin, which is "null" for a
  // custom scheme in Chromium.
  const origin = desktopBase.replace(/\/+$/u, '');
  return {
    src: `${origin}/${HDF5_VIEWER_PATH}?host=${encodeURIComponent(hostOrigin)}`,
    origin,
  };
}

/** {@link viewerLocation} for the running app. */
export function currentViewerLocation(): ViewerLocation {
  return viewerLocation(window.location.origin, desktopViewerBase());
}

/**
 * The viewer origin's base URL in a packaged desktop app. Not in `tauri dev`:
 * the dev server serves the viewer and the app has no CSP there.
 */
function desktopViewerBase(): string | undefined {
  if (import.meta.env.DEV || !inTauri()) return undefined;
  const internals = (
    window as typeof window & {
      __TAURI_INTERNALS__?: { convertFileSrc?: (path: string, scheme: string) => string };
    }
  ).__TAURI_INTERNALS__;
  return internals?.convertFileSrc?.('', DESKTOP_VIEWER_SCHEME);
}
