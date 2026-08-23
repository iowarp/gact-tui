export function inTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const runtimeWindow = window as typeof window & {
    isTauri?: boolean;
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return (
    runtimeWindow.isTauri === true ||
    runtimeWindow.__TAURI__ !== undefined ||
    runtimeWindow.__TAURI_INTERNALS__ !== undefined
  );
}
