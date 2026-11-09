type DesktopWindow = typeof window & {
  __CLIO_DESKTOP__?: { version?: string };
  isTauri?: boolean;
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

let detected: boolean | undefined;

/**
 * True only inside this desktop app. Any Tauri WebView exposes the Tauri globals,
 * including another Tauri app showing an agent's own web UI, so the desktop host's
 * injected `__CLIO_DESKTOP__` marker is what identifies it (#739). The host does not
 * change for the life of the page, so the answer is computed once.
 */
export function inTauri(): boolean {
  if (detected !== undefined) return detected;
  if (typeof window === 'undefined') return false;
  const runtimeWindow = window as DesktopWindow;
  detected =
    runtimeWindow.__CLIO_DESKTOP__ !== undefined &&
    (runtimeWindow.isTauri === true ||
      runtimeWindow.__TAURI__ !== undefined ||
      runtimeWindow.__TAURI_INTERNALS__ !== undefined);
  return detected;
}

/** Tests that fake or remove the desktop host re-run detection after changing it. */
export function resetDesktopHostDetection(): void {
  detected = undefined;
}
