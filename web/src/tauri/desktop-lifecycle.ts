import { inTauri } from '@/lib/transport/tauri-runtime';

export const DESKTOP_RESUMED_EVENT = 'clio:desktop-resumed';

/**
 * Windows and Linux: emitted by the native shell when a close request arrives
 * (Alt+F4, the OS close box) instead of auto-hiding or
 * auto-quitting: the frontend owns the "Keep CLIO running?" confirmation
 * prompt from here, the same one the title-bar close button and hamburger
 * Quit already use. Carries a `seq` the frontend echoes back via
 * `ackClosePromptShown` so a fast repeat (e.g. Alt+F4 pressed twice) can be
 * correlated correctly instead of racing a single global ack flag.
 */
export const CLOSE_REQUESTED_EVENT = 'clio:close-requested';

/**
 * Emitted by the native shell right before its 500ms fallback hides the
 * window because the frontend never acknowledged a close-request prompt in
 * time. The frontend clears its own prompt-open state in response, rather
 * than leaving a confirmation dialog rendered over a now-hidden window.
 */
export const CLOSE_FALLBACK_HIDDEN_EVENT = 'clio:close-fallback-hidden';

/**
 * macOS: emitted when Cmd-Q or the app or menu bar Quit is chosen. The
 * frontend quits at once unless a conversation is still running, in which
 * case it asks first. The native side quits if no answer arrives in 500ms.
 * The red close button and Cmd-W only hide the window, as Mac apps do.
 */
export const QUIT_REQUESTED_EVENT = 'clio:quit-requested';

/** Payload for {@link CLOSE_REQUESTED_EVENT} and {@link QUIT_REQUESTED_EVENT}. */
export interface CloseRequestedPayload {
  seq: number;
}

/** Subscribe to native application resume events when running in the installed workspace. */
export async function listenForDesktopResume(onResume: () => void): Promise<() => void> {
  if (!inTauri()) return () => undefined;
  const { listen } = await import('@tauri-apps/api/event');
  return listen(DESKTOP_RESUMED_EVENT, onResume);
}

/** Subscribe to native close-request events when running in the installed workspace. */
export async function listenForCloseRequested(
  onCloseRequested: (seq: number) => void,
): Promise<() => void> {
  if (!inTauri()) return () => undefined;
  const { listen } = await import('@tauri-apps/api/event');
  return listen<CloseRequestedPayload>(CLOSE_REQUESTED_EVENT, ({ payload }) =>
    onCloseRequested(payload.seq),
  );
}

/** Subscribe to native (macOS) quit requests when running in the installed workspace. */
export async function listenForQuitRequested(
  onQuitRequested: (seq: number) => void,
): Promise<() => void> {
  if (!inTauri()) return () => undefined;
  const { listen } = await import('@tauri-apps/api/event');
  return listen<CloseRequestedPayload>(QUIT_REQUESTED_EVENT, ({ payload }) =>
    onQuitRequested(payload.seq),
  );
}

/**
 * Subscribe to the native fallback-hide notice when running in the
 * installed workspace.
 */
export async function listenForCloseFallbackHidden(onHidden: () => void): Promise<() => void> {
  if (!inTauri()) return () => undefined;
  const { listen } = await import('@tauri-apps/api/event');
  return listen(CLOSE_FALLBACK_HIDDEN_EVENT, onHidden);
}
