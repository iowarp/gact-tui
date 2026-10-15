/**
 * Origins of the desktop app's main page, one per platform. The desktop app
 * serves this viewer from its own origin (`gact-viewer://localhost`, or
 * `http://gact-viewer.localhost` on Windows) so the viewer can have its own
 * CSP, and names the app's origin in the `host` query parameter.
 */
export const DESKTOP_APP_ORIGINS: readonly string[] = [
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
];

/**
 * The origin of the page allowed to drive this viewer.
 *
 * In the desktop app that is the app's main page, named by `?host=` and
 * accepted only if it is one of {@link DESKTOP_APP_ORIGINS}. Everywhere else
 * the viewer is served by the web app itself, so the host is this page's own
 * origin.
 */
export function hostOriginFor(location: Pick<Location, 'origin' | 'search'>): string {
  const named = new URLSearchParams(location.search).get('host');
  return named !== null && DESKTOP_APP_ORIGINS.includes(named) ? named : location.origin;
}
