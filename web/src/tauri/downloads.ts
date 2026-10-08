import { invoke } from '@tauri-apps/api/core';

/** Reveal the desktop's download history (the native Ctrl+J dialog on Windows). */
export async function openDownloads(): Promise<void> {
  await invoke('open_downloads');
}
