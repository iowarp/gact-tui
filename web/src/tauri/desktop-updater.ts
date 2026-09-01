import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { UPDATE_CHECK_TIMEOUT_MS } from '@/lib/runtime-limits';
import { inTauri } from '@/lib/transport/tauri-runtime';

export interface DesktopUpdateInfo {
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
}

export interface DesktopUpdateProgress {
  downloadedBytes: number;
  totalBytes?: number;
  finished: boolean;
}

let availableUpdate: Update | null = null;

/** Check the signed native update feed. Returns null when the installed build is current. */
export async function checkForDesktopUpdate(): Promise<DesktopUpdateInfo | null> {
  if (!inTauri()) throw new Error('App updates are available only in the installed desktop app.');
  if (availableUpdate) {
    await availableUpdate.close();
    availableUpdate = null;
  }
  const { check } = await import('@tauri-apps/plugin-updater');
  availableUpdate = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS });
  return availableUpdate
    ? {
        currentVersion: availableUpdate.currentVersion,
        version: availableUpdate.version,
        date: availableUpdate.date,
        body: availableUpdate.body,
      }
    : null;
}

/** Install the update returned by the most recent check and relaunch into it. */
export async function installDesktopUpdate(
  onProgress: (progress: DesktopUpdateProgress) => void,
): Promise<void> {
  if (!availableUpdate) throw new Error('Check for an available update before installing.');
  let downloadedBytes = 0;
  let totalBytes: number | undefined;
  await availableUpdate.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === 'Started') {
      totalBytes = event.data.contentLength;
      onProgress({ downloadedBytes, totalBytes, finished: false });
      return;
    }
    if (event.event === 'Progress') {
      downloadedBytes += event.data.chunkLength;
      onProgress({ downloadedBytes, totalBytes, finished: false });
      return;
    }
    onProgress({ downloadedBytes, totalBytes, finished: true });
  });
  await availableUpdate.close();
  availableUpdate = null;
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}
