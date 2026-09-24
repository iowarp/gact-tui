import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { toast } from 'sonner';
import {
  BACKGROUND_UPDATE_CHECK_INTERVAL_MS,
  BACKGROUND_UPDATE_CHECK_MIN_INTERVAL_MS,
  UPDATE_CHECK_TIMEOUT_MS,
} from '@/lib/runtime-limits';
import { formatBytes } from '@/lib/format';
import { inTauri } from '@/lib/transport/tauri-runtime';

/**
 * Stable id for the background "an update is available" toast, shared with
 * the manual "Check for updates" button (`settings-desktop.tsx`). A stable
 * id means a re-fired background check UPDATES the same toast instead of
 * stacking a new one every `BACKGROUND_UPDATE_CHECK_INTERVAL_MS`, and lets a
 * manual check that finds the build current dismiss a stale one.
 */
export const DESKTOP_UPDATE_TOAST_ID = 'desktop-update-available';

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

export type DesktopUpdateSnapshot =
  | { status: 'unknown' | 'checking' | 'current' }
  | { status: 'available'; update: DesktopUpdateInfo }
  | { status: 'error'; message: string };

let availableUpdate: Update | null = null;
let updateSnapshot: DesktopUpdateSnapshot = { status: 'unknown' };
const updateListeners = new Set<(snapshot: DesktopUpdateSnapshot) => void>();

function publishUpdateSnapshot(snapshot: DesktopUpdateSnapshot): void {
  updateSnapshot = snapshot;
  for (const listener of updateListeners) listener(snapshot);
}

/** Read the last result shared by startup checks, Settings, and the navigation badge. */
export function getDesktopUpdateSnapshot(): DesktopUpdateSnapshot {
  return updateSnapshot;
}

/** Subscribe without causing an additional network request. */
export function subscribeDesktopUpdate(
  listener: (snapshot: DesktopUpdateSnapshot) => void,
): () => void {
  updateListeners.add(listener);
  listener(updateSnapshot);
  return () => updateListeners.delete(listener);
}

/**
 * Read the ``version`` field out of the same signed manifest
 * (`latest-lite.json`) the desktop updater plugin polls above -- a plain,
 * unauthenticated JSON GET, not the plugin's signature-verified `check()`.
 * Unlike `checkForDesktopUpdate`, this has no `inTauri()` gate: it runs
 * identically inside the desktop webview and the plain web build, so the
 * connected agent's version can be compared against the latest published
 * CLIO release even where the Tauri updater plugin doesn't exist.
 *
 * `releaseUrl` is the release index (e.g. `https://github.com/<org>/<repo>/releases`)
 * a brand profile already carries as `agentReleaseUrl` -- the manifest lives at
 * `<releaseUrl>/latest/download/latest-lite.json` (see clio-agent's
 * `clio-bundles.yml` release workflow, which publishes it there).
 *
 * Never throws: a missing release feed, a failed request, or an unparsable
 * body all resolve to `undefined` so a caller renders "not checked" instead
 * of fabricating a status (#775 no silent fallback -- the caller decides how
 * to present "unknown", this just refuses to guess a version number).
 */
export async function fetchLatestClioVersion(releaseUrl: string | null): Promise<string | undefined> {
  if (!releaseUrl) return undefined;
  try {
    const response = await fetch(`${releaseUrl}/latest/download/latest-lite.json`);
    if (!response.ok) return undefined;
    const manifest: unknown = await response.json();
    const version =
      manifest && typeof manifest === 'object'
        ? (manifest as { version?: unknown }).version
        : undefined;
    return typeof version === 'string' && version.trim() ? version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Persists the "last checked" clock across app restarts, written by every
 * real check attempt (manual button or background scheduler alike).
 */
const LAST_CHECKED_STORAGE_KEY = 'clio.desktop-update.last-checked';

/**
 * Turns a raw updater-plugin failure into the honest, typed message the UI
 * shows — never a blank or a generic retry prompt when the cause is known.
 * Falls through to the underlying message for anything unrecognized, and to
 * a fixed fallback only when the error carries no message at all.
 *
 * Matched against `tauri-plugin-updater`'s and `minisign-verify`'s actual
 * `Display` strings (verified in the vendored crate sources, not guessed):
 * - `Error::ReleaseNotFound` → "Could not fetch a valid release JSON from
 *   the remote" (a non-2xx or unparsable manifest — no "404" in the text).
 * - `Error::TargetNotFound` / `TargetsNotFound` → "...was not found in the
 *   response `platforms` object" (a published manifest with no entry for
 *   this OS/arch) — distinct from the manifest being missing entirely.
 * - `minisign_verify::Error::InvalidSignature` / `UnexpectedKeyId` → "The
 *   signature verification failed" / "...created with a different key...".
 */
export function describeUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes('could not fetch a valid release json')) {
    return 'No update manifest published yet';
  }
  // Covers both `TargetNotFound` ("was not found in the response") and
  // `TargetsNotFound` ("were found in the response", negated by its "None
  // of the fallback platforms" prefix) via their shared stable suffix.
  if (normalized.includes('found in the response') && normalized.includes('platform')) {
    return 'No update published for this platform';
  }
  if (
    normalized.includes('signature verification failed') ||
    normalized.includes('created with a different key')
  ) {
    return 'Update rejected: signature mismatch';
  }
  return message || 'The update service did not respond.';
}

/**
 * Read the persisted "last checked" clock. Shared by BOTH the background
 * scheduler and the manual "Check for updates" button — `checkForDesktopUpdate`
 * writes it on every real attempt regardless of caller (see there), so a
 * manual check also counts against the background minimum interval.
 */
function readLastCheckedAt(): number {
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

function writeLastCheckedAt(value: number): void {
  try {
    localStorage.setItem(LAST_CHECKED_STORAGE_KEY, String(value));
  } catch {
    // Best-effort persistence only — see readLastCheckedAt.
  }
}

/**
 * Check the signed native update feed. Returns null when the installed
 * build is current. Records the "last checked" clock on every real attempt
 * (before the network call, so a slow/hanging check still counts) — this is
 * the single function both the manual button and the background scheduler
 * call, so both paths count against `BACKGROUND_UPDATE_CHECK_MIN_INTERVAL_MS`.
 */
export async function checkForDesktopUpdate(): Promise<DesktopUpdateInfo | null> {
  if (!inTauri()) throw new Error('App updates are available only in the installed desktop app.');
  writeLastCheckedAt(Date.now());
  publishUpdateSnapshot({ status: 'checking' });
  try {
    if (availableUpdate) {
      await availableUpdate.close();
      availableUpdate = null;
    }
    const { check } = await import('@tauri-apps/plugin-updater');
    availableUpdate = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS });
    const update = availableUpdate
      ? {
          currentVersion: availableUpdate.currentVersion,
          version: availableUpdate.version,
          date: availableUpdate.date,
          body: availableUpdate.body,
        }
      : null;
    publishUpdateSnapshot(update ? { status: 'available', update } : { status: 'current' });
    return update;
  } catch (error) {
    publishUpdateSnapshot({ status: 'error', message: describeUpdateError(error) });
    throw error;
  }
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

/** Renders one download-progress update as the text of the "Restart to update" toast. */
function describeUpdateProgress(progress: DesktopUpdateProgress): string {
  if (progress.finished) return 'Installing update…';
  if (progress.totalBytes && progress.totalBytes > 0) {
    const percent = Math.min(
      100,
      Math.round((progress.downloadedBytes / progress.totalBytes) * 100),
    );
    return `Downloading update, ${percent}%`;
  }
  return `Downloading update, ${formatBytes(progress.downloadedBytes)} received`;
}

/**
 * Restarts into the update surfaced by a background check, or reports why it
 * could not. Turns the toast itself into a live progress indicator (the
 * background toast has no settings panel open to show the existing
 * `UpdateAvailable` block's progress bar) and always clears it on relaunch
 * or on failure — never left showing a stale "Downloading…" forever.
 */
async function restartToUpdate(): Promise<void> {
  toast.loading('Downloading update…', { id: DESKTOP_UPDATE_TOAST_ID });
  try {
    await installDesktopUpdate((progress) => {
      toast.loading(describeUpdateProgress(progress), { id: DESKTOP_UPDATE_TOAST_ID });
    });
    // installDesktopUpdate relaunches on success; this only runs if that
    // somehow returns without replacing the process.
    toast.dismiss(DESKTOP_UPDATE_TOAST_ID);
  } catch (error) {
    toast.dismiss(DESKTOP_UPDATE_TOAST_ID);
    toast.error(describeUpdateError(error));
  }
}

/**
 * Runs one background update check when at least
 * `BACKGROUND_UPDATE_CHECK_MIN_INTERVAL_MS` has passed since the persisted
 * last check, and surfaces an available update as a toast (stable
 * `DESKTOP_UPDATE_TOAST_ID`, so a later re-fire updates it instead of
 * stacking a new one) offering an immediate restart. A failed check is
 * logged, not surfaced — an unattended background probe must never
 * interrupt the person with an error dialog the manual "Check for updates"
 * button already covers.
 *
 * A stored last-checked timestamp from the future (clock skew, a corrupted
 * or hand-edited value) is treated as "never checked" rather than a wait
 * that can never elapse — a `now - future` gap is negative and would
 * otherwise permanently block every future check.
 *
 * Exported for its own tests; `scheduleBackgroundUpdateCheck` is the entry
 * point production code calls.
 */
export async function runBackgroundUpdateCheck(now: number = Date.now()): Promise<void> {
  if (!inTauri()) return;
  const lastCheckedAt = readLastCheckedAt();
  const elapsedMs = lastCheckedAt > now ? Number.POSITIVE_INFINITY : now - lastCheckedAt;
  if (elapsedMs < BACKGROUND_UPDATE_CHECK_MIN_INTERVAL_MS) return;
  let update: DesktopUpdateInfo | null;
  try {
    // checkForDesktopUpdate itself records the "last checked" clock, so a
    // manual check counts against this gate too (see its own doc comment).
    update = await checkForDesktopUpdate();
  } catch (error) {
    console.warn('Background update check failed:', describeUpdateError(error));
    return;
  }
  if (!update) return;
  toast(`Version ${update.version} is available`, {
    id: DESKTOP_UPDATE_TOAST_ID,
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
  const timer = setInterval(
    () => void runBackgroundUpdateCheck(),
    BACKGROUND_UPDATE_CHECK_INTERVAL_MS,
  );
  return () => clearInterval(timer);
}
