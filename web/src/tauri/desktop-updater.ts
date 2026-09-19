import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { toast } from 'sonner';
import {
  BACKGROUND_UPDATE_CHECK_INTERVAL_MS,
  BACKGROUND_UPDATE_CHECK_MIN_INTERVAL_MS,
  UPDATE_CHECK_TIMEOUT_MS,
} from '@/lib/runtime-limits';
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

/** Persists the background checker's "last checked" clock across app restarts. */
const LAST_CHECKED_STORAGE_KEY = 'clio.desktop-update.last-checked';

/**
 * Turns a raw updater-plugin failure into the honest, typed message the UI
 * shows — never a blank or a generic retry prompt when the cause is known.
 * Falls through to the underlying message for anything unrecognized, and to
 * a fixed fallback only when the error carries no message at all.
 */
export function describeUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes('404') || normalized.includes('not found')) {
    return 'No update manifest published yet';
  }
  if (normalized.includes('signature')) {
    return 'Update rejected: signature mismatch';
  }
  return message || 'The update service did not respond.';
}

function readLastBackgroundCheck(): number {
  try {
    const raw = localStorage.getItem(LAST_CHECKED_STORAGE_KEY);
    const parsed = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    // A blocked or unavailable store just means every boot re-checks; the
    // 404/signature/error handling below still applies once it runs.
    return 0;
  }
}

function writeLastBackgroundCheck(value: number): void {
  try {
    localStorage.setItem(LAST_CHECKED_STORAGE_KEY, String(value));
  } catch {
    // Best-effort persistence only — see readLastBackgroundCheck.
  }
}

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

/** Restarts into the update surfaced by a background check, or reports why it could not. */
async function restartToUpdate(): Promise<void> {
  try {
    await installDesktopUpdate(() => {});
  } catch (error) {
    toast.error(describeUpdateError(error));
  }
}

/**
 * Runs one background update check when at least
 * `BACKGROUND_UPDATE_CHECK_MIN_INTERVAL_MS` has passed since the persisted
 * last check, and surfaces an available update as a toast offering an
 * immediate restart. A failed check is logged, not surfaced — an
 * unattended background probe must never interrupt the person with an error
 * dialog the manual "Check for updates" button already covers.
 *
 * Exported for its own tests; `scheduleBackgroundUpdateCheck` is the entry
 * point production code calls.
 */
export async function runBackgroundUpdateCheck(now: number = Date.now()): Promise<void> {
  if (!inTauri()) return;
  if (now - readLastBackgroundCheck() < BACKGROUND_UPDATE_CHECK_MIN_INTERVAL_MS) return;
  writeLastBackgroundCheck(now);
  let update: DesktopUpdateInfo | null;
  try {
    update = await checkForDesktopUpdate();
  } catch (error) {
    console.warn('Background update check failed:', describeUpdateError(error));
    return;
  }
  if (!update) return;
  toast(`Version ${update.version} is available`, {
    description: 'Restart to install the signed update.',
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: 'Restart to update',
      onClick: () => void restartToUpdate(),
    },
  });
}

/**
 * Schedules the recurring background update check: once immediately (subject
 * to the persisted minimum interval, so a fresh boot right after a manual
 * check does not re-check), then every `BACKGROUND_UPDATE_CHECK_INTERVAL_MS`.
 * A no-op outside the installed desktop app. Call once the app has a live
 * connection; call the returned cleanup on unmount so navigating away never
 * accumulates timers.
 */
export function scheduleBackgroundUpdateCheck(): () => void {
  if (!inTauri()) return () => {};
  void runBackgroundUpdateCheck();
  const timer = setInterval(() => void runBackgroundUpdateCheck(), BACKGROUND_UPDATE_CHECK_INTERVAL_MS);
  return () => clearInterval(timer);
}
