import { inTauri } from '@/lib/transport/tauri-runtime';

export const DESKTOP_RESUMED_EVENT = 'clio:desktop-resumed';

/**
 * Emitted by the native shell when a close request arrives (Alt+F4, the OS
 * close box, the traffic-light close button) instead of auto-hiding or
 * auto-quitting: the frontend owns the "Keep CLIO running?" confirmation
 * prompt from here, the same one the title-bar close button and hamburger
 * Quit already use.
 */
export const CLOSE_REQUESTED_EVENT = 'clio:close-requested';

/** Subscribe to native application resume events when running in the installed workspace. */
export async function listenForDesktopResume(onResume: () => void): Promise<() => void> {
  if (!inTauri()) return () => undefined;
  const { listen } = await import('@tauri-apps/api/event');
  return listen(DESKTOP_RESUMED_EVENT, onResume);
}

/** Subscribe to native close-request events when running in the installed workspace. */
export async function listenForCloseRequested(onCloseRequested: () => void): Promise<() => void> {
  if (!inTauri()) return () => undefined;
  const { listen } = await import('@tauri-apps/api/event');
  return listen(CLOSE_REQUESTED_EVENT, onCloseRequested);
}
