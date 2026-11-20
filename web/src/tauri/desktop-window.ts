export type DesktopWindowAction =
  | 'hide'
  | 'minimize'
  | 'quit'
  | 'toggleMaximize'
  | 'toggleFullscreen';

/** Execute a window action through Tauri without loading its API in web builds. */
export async function runDesktopWindowAction(action: DesktopWindowAction): Promise<void> {
  if (action === 'quit') {
    await quitDesktop();
    return;
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const desktopWindow = getCurrentWindow();
  if (action === 'toggleFullscreen') {
    await desktopWindow.setFullscreen(!(await desktopWindow.isFullscreen()));
    return;
  }
  await desktopWindow[action]();
}

/**
 * Quit CLIO. `closeRelays` is the quit prompt's "Also close open relays" answer, which
 * the host saves; without it the saved choice applies. With `true` the window stays
 * up until the relays are closed, so the prompt can show that it is closing them.
 */
export async function quitDesktop(closeRelays?: boolean): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  if (closeRelays === undefined) await invoke('quit_clio');
  else await invoke('quit_clio', { closeRelays });
}

/** What the quit prompt starts from; `relays` is null when there are none to close. */
export type DesktopQuitPrompt = {
  closeRelaysOnQuit: boolean;
  relays: { available: boolean; endpoints: number } | null;
};

export async function readQuitPrompt(): Promise<DesktopQuitPrompt> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<DesktopQuitPrompt>('quit_preferences');
}

/**
 * Ack that the close-confirmation prompt is now on screen, in response to a
 * native `clio:close-requested` event carrying this `seq`. Tells the Rust
 * side's 500ms fallback for THIS SAME close request (correlated by `seq`,
 * not a single global flag — a fast repeat like Alt+F4 pressed twice must
 * not let a late ack for an older request suppress the fallback for a
 * newer, still-unhandled one) not to hide the window out from under an open
 * dialog.
 */
export async function ackClosePromptShown(seq: number): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('close_prompt_shown', { seq });
}

/**
 * Answer a native `clio:quit-requested` event (macOS): the frontend now owns
 * this quit, so the native 500ms fallback does not quit underneath it. With
 * `showWindow` the host brings the main window forward for the confirmation.
 */
export async function ackQuitPromptShown(seq: number, showWindow: boolean): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('quit_prompt_shown', { seq, showWindow });
}

/**
 * The desktop host opens its window hidden on a dark background and shows it when
 * the page has committed its first frame, so launch never flashes an unpainted
 * WebView (#739). The host reveals it on its own after a short fallback.
 */
export async function revealStartupWindow(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('reveal_startup_window');
}
