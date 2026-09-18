export type DesktopWindowAction =
  | 'hide'
  | 'minimize'
  | 'quit'
  | 'toggleMaximize'
  | 'toggleFullscreen';

/** Execute a window action through Tauri without loading its API in web builds. */
export async function runDesktopWindowAction(action: DesktopWindowAction): Promise<void> {
  if (action === 'quit') {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('quit_clio');
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
 * Ack that the close-confirmation prompt is now on screen, in response to a
 * native `clio:close-requested` event. Tells the Rust side's 500ms fallback
 * (which exists only for an unloaded or crashed WebView) not to hide the
 * window out from under an open dialog.
 */
export async function ackClosePromptShown(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('close_prompt_shown');
}
