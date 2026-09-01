import { inTauri } from '@/lib/transport/tauri-runtime';

export const DESKTOP_RESUMED_EVENT = 'clio:desktop-resumed';

/** Subscribe to native application resume events when running in the installed workspace. */
export async function listenForDesktopResume(onResume: () => void): Promise<() => void> {
  if (!inTauri()) return () => undefined;
  const { listen } = await import('@tauri-apps/api/event');
  return listen(DESKTOP_RESUMED_EVENT, onResume);
}
