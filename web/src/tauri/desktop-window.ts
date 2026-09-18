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
