/**
 * Detects whether the current page is running inside a Tauri shell.
 *
 * Tauri 2 exposes `window.isTauri` as the public runtime signal. Some
 * builds also expose global/internal bridge objects depending on config,
 * so keep those as fallbacks for packaged and test shells.
 */
export function inTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const runtimeWindow = window as typeof window & {
    isTauri?: boolean;
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return (
    runtimeWindow.isTauri === true ||
    typeof runtimeWindow.__TAURI__ !== 'undefined' ||
    typeof runtimeWindow.__TAURI_INTERNALS__ !== 'undefined'
  );
}
