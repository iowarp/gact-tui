import { invoke } from '@tauri-apps/api/core';

/** Reveal Windows' native download history, or the Downloads folder on macOS/Linux. */
export async function openDownloads(): Promise<void> {
  await invoke('open_downloads');
}
