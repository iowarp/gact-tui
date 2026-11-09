import { resetDesktopHostDetection } from '@/lib/transport/tauri-runtime';

type HostWindow = Record<'__CLIO_DESKTOP__' | '__TAURI_INTERNALS__', unknown>;

/**
 * Make the page look like it runs inside the desktop app: the host's
 * `__CLIO_DESKTOP__` marker (`marker`) plus the Tauri IPC globals (`internals`).
 * Returns the matching cleanup.
 */
export function mockDesktopHost(
  internals: object = {},
  marker: object = { version: 'test' },
): () => void {
  const host = window as unknown as HostWindow;
  Object.defineProperty(host, '__TAURI_INTERNALS__', {
    configurable: true,
    writable: true,
    value: internals,
  });
  Object.defineProperty(host, '__CLIO_DESKTOP__', {
    configurable: true,
    writable: true,
    value: marker,
  });
  resetDesktopHostDetection();
  return clearDesktopHost;
}

/** Back to a plain browser page. */
export function clearDesktopHost(): void {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  Reflect.deleteProperty(window, '__CLIO_DESKTOP__');
  resetDesktopHostDetection();
}
