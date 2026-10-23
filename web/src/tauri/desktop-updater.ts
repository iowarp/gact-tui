import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { toast } from 'sonner';
import { brand } from '@brand';
import { vocab } from '@/lib/brand-vocabulary';
import { latestPublishedRelease, ReleaseFeedRateLimited } from '@/lib/github-releases';
import {
  getUpdateChannel,
  initializeUpdateChannel,
  subscribeUpdateChannel,
  type UpdateChannel,
} from '@/lib/update-channel';
import {
  BACKGROUND_UPDATE_CHECK_INTERVAL_MS,
  BACKGROUND_UPDATE_CHECK_MIN_INTERVAL_MS,
  UPDATE_CHECK_TIMEOUT_MS,
} from '@/lib/runtime-limits';
import { formatBytes } from '@/lib/format';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { compareReleaseVersions, displayReleaseVersion, releaseTag } from '@/lib/release-version';
import {
  hasManagedRuntime,
  managedRuntimeUpdateMode,
  restartClio,
  updateManagedClio,
} from './managed-backend';
import { managedClioVersion } from './clio-update-verification';
import {
  clearPendingUpdateMarker,
  isUpdateInFlight,
  useUpdateFlowStore,
  writePendingUpdateMarker,
} from '@/store/update-flow-store';

/**
 * Stable id for the background "an update is available" toast, shared with
 * the manual "Check for updates" button (`settings-app-updates.tsx`). A stable
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
  /** Repair the owned runtime to the installed app when no shell update is needed. */
  repair?: boolean;
}

export interface DesktopUpdateProgress {
  downloadedBytes: number;
  totalBytes?: number;
  finished: boolean;
}

/** Why a desktop update check failed (see {@link classifyUpdateError}). */
export type DesktopUpdateFailure =
  | 'version_mismatch'
  | 'manifest_not_published'
  | 'platform_not_published'
  | 'signature_mismatch'
  | 'rate_limited'
  | 'unreachable';

export type DesktopUpdateSnapshot =
  | { status: 'unknown' | 'checking' | 'current' }
  | { status: 'available'; update: DesktopUpdateInfo }
  | { status: 'error'; message: string; reason: DesktopUpdateFailure };

let availableUpdate: Update | null = null;
let installingUpdate: Update | null = null;
let installingProduct = false;
let runtimeRepair: DesktopUpdateInfo | null = null;
let availableChannel: UpdateChannel = 'stable';
let checkGeneration = 0;
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

/** Keep channel controls locked during installs started from any UI entry point. */
export function isDesktopUpdateInstalling(): boolean {
  return installingProduct;
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
 * Persists the "last checked" clock across app restarts, written by every
 * real check attempt (manual button or background scheduler alike).
 */
const LAST_CHECKED_STORAGE_KEY = 'clio.desktop-update.last-checked';

subscribeUpdateChannel(() => {
  checkGeneration += 1;
  const previous = availableUpdate;
  availableUpdate = null;
  runtimeRepair = null;
  if (previous && previous !== installingUpdate) void previous.close().catch(() => undefined);
  publishUpdateSnapshot({ status: 'unknown' });
  toast.dismiss(DESKTOP_UPDATE_TOAST_ID);
});

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
  return classifyUpdateError(error).message;
}

/** {@link describeUpdateError}'s message plus the typed reason it matched. */
export function classifyUpdateError(error: unknown): {
  reason: DesktopUpdateFailure;
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ReleaseFeedRateLimited) return { reason: 'rate_limited', message };
  const normalized = message.toLowerCase();
  if (normalized.startsWith('components differ:')) {
    return { reason: 'version_mismatch', message };
  }
  if (normalized.includes('could not fetch a valid release json')) {
    return { reason: 'manifest_not_published', message: 'No update manifest published yet' };
  }
  // Covers both `TargetNotFound` ("was not found in the response") and
  // `TargetsNotFound` ("were found in the response", negated by its "None
  // of the fallback platforms" prefix) via their shared stable suffix.
  if (normalized.includes('found in the response') && normalized.includes('platform')) {
    return { reason: 'platform_not_published', message: 'No update published for this platform' };
  }
  if (
    normalized.includes('signature verification failed') ||
    normalized.includes('created with a different key')
  ) {
    return { reason: 'signature_mismatch', message: 'Update rejected: signature mismatch' };
  }
  return { reason: 'unreachable', message: message || 'The update service did not respond.' };
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
  if (installingProduct || isUpdateInFlight(useUpdateFlowStore.getState().step))
    throw new Error('An update is already in progress.');
  const { getVersion } = await import('@tauri-apps/api/app');
  const currentVersion = await getVersion();
  initializeUpdateChannel(currentVersion);
  if (installingProduct) throw new Error('An update is already in progress.');
  const channel = getUpdateChannel();
  const generation = ++checkGeneration;
  writeLastCheckedAt(Date.now());
  publishUpdateSnapshot({ status: 'checking' });
  let candidate: Update | null = null;
  try {
    const previous = availableUpdate;
    availableUpdate = null;
    runtimeRepair = null;
    if (previous) await previous.close();
    const { check, Update } = await import('@tauri-apps/plugin-updater');
    if (channel === 'beta') {
      if (!brand.desktopReleaseUrl) throw new Error('No beta release feed is configured.');
      const release = await latestPublishedRelease(brand.desktopReleaseUrl, channel);
      const { invoke } = await import('@tauri-apps/api/core');
      const metadata = await invoke<ConstructorParameters<typeof Update>[0] | null>(
        'check_release_update',
        { tag: release.tag_name },
      );
      candidate = metadata ? new Update(metadata) : null;
    } else {
      candidate = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS });
    }
    if (generation !== checkGeneration || channel !== getUpdateChannel()) {
      await candidate?.close();
      return null;
    }
    let repair: DesktopUpdateInfo | null = null;
    if (await hasManagedRuntime()) {
      let runtime: string | undefined;
      try {
        runtime = await managedClioVersion();
      } catch (error) {
        console.warn(
          'The owned runtime is unavailable; the selected release will repair it:',
          describeUpdateError(error),
        );
      }
      const target = candidate?.version ?? currentVersion;
      const difference = runtime ? compareReleaseVersions(runtime, target) : -1;
      if (difference > 0) {
        throw new Error(
          `Components differ: runtime ${runtime}, app target ${displayReleaseVersion(target)}. A matching signed app release is required; the runtime will not be downgraded automatically.`,
        );
      }
      if (!candidate && difference < 0) {
        repair = {
          currentVersion,
          version: currentVersion,
          repair: true,
          body: runtime
            ? `The runtime is ${runtime}. Restore the app and runtime to the same release.`
            : 'The local runtime is unavailable. Restore the app and runtime to the same release.',
        };
        if ((await managedRuntimeUpdateMode()) === 'bundled') {
          const { invoke } = await import('@tauri-apps/api/core');
          const metadata = await invoke<ConstructorParameters<typeof Update>[0] | null>(
            'check_release_update',
            { tag: releaseTag(currentVersion), repair: true },
          );
          if (!metadata)
            throw new Error('The signed installer for this app version is unavailable.');
          candidate = new Update(metadata);
        }
      }
    }
    if (generation !== checkGeneration || channel !== getUpdateChannel()) {
      await candidate?.close();
      return null;
    }
    availableUpdate = candidate;
    runtimeRepair = repair;
    availableChannel = channel;
    const update = candidate
      ? {
          currentVersion: candidate.currentVersion,
          version: candidate.version,
          date: candidate.date,
          body: candidate.body,
          repair: repair?.repair,
        }
      : repair;
    publishUpdateSnapshot(update ? { status: 'available', update } : { status: 'current' });
    return update;
  } catch (error) {
    await candidate
      ?.close()
      .catch((closeError: unknown) => console.warn('Could not close update check', closeError));
    if (generation === checkGeneration) {
      publishUpdateSnapshot({ status: 'error', ...classifyUpdateError(error) });
    }
    throw error;
  }
}

/** Install the update returned by the most recent check and relaunch into it. */
export async function installDesktopUpdate(
  onProgress: (progress: DesktopUpdateProgress) => void,
): Promise<void> {
  if (installingProduct || isUpdateInFlight(useUpdateFlowStore.getState().step)) {
    throw new Error('An update is already in progress.');
  }
  if (!availableUpdate && !runtimeRepair)
    throw new Error('Check for an available update before installing.');
  if (availableChannel !== getUpdateChannel())
    throw new Error('The update channel changed. Check for updates again.');
  const update = availableUpdate;
  const version = displayReleaseVersion(update?.version ?? runtimeRepair?.version);
  if (!version) throw new Error('The release target is missing. Check for updates again.');
  installingProduct = true;
  installingUpdate = update;
  checkGeneration += 1;
  publishUpdateSnapshot({ ...updateSnapshot });
  let runtimeUpdateStarted = false;
  let desktopInstallStarted = false;
  try {
    const runtimeMode = await managedRuntimeUpdateMode();
    const ownsRuntime = runtimeMode !== 'external';
    let currentRuntime: string | undefined;
    let runtimeIssue: string | undefined;
    if (ownsRuntime) {
      try {
        currentRuntime = await managedClioVersion();
      } catch (error) {
        runtimeIssue = describeUpdateError(error);
        console.warn('Repairing an unavailable owned runtime:', runtimeIssue);
      }
    }
    if (currentRuntime && compareReleaseVersions(currentRuntime, version) > 0) {
      throw new Error(
        'The local runtime is newer than the selected app release. Check for a matching app update.',
      );
    }
    const action = ownsRuntime ? 'both' : 'desktop';
    useUpdateFlowStore.getState().start(action, version);
    if (runtimeIssue)
      useUpdateFlowStore.getState().appendLine(`Local runtime unavailable: ${runtimeIssue}`);
    writePendingUpdateMarker({ action, version, startedAt: Date.now() });
    useUpdateFlowStore.getState().setStep(update ? 'downloading' : 'installing');
    let downloadedBytes = 0;
    let totalBytes: number | undefined;
    await update?.download((event: DownloadEvent) => {
      const publishProgress = (progress: DesktopUpdateProgress) => {
        useUpdateFlowStore.getState().setProgress(progress);
        onProgress(progress);
      };
      if (event.event === 'Started') {
        totalBytes = event.data.contentLength;
        publishProgress({ downloadedBytes, totalBytes, finished: false });
        return;
      }
      if (event.event === 'Progress') {
        downloadedBytes += event.data.chunkLength;
        publishProgress({ downloadedBytes, totalBytes, finished: false });
        return;
      }
      publishProgress({ downloadedBytes, totalBytes, finished: true });
    });
    // Finish the signed download before stopping or changing the runtime.
    if (
      ownsRuntime &&
      !(update && runtimeMode === 'bundled') &&
      (!currentRuntime || compareReleaseVersions(currentRuntime, version) !== 0)
    ) {
      useUpdateFlowStore.getState().setStep('installing');
      runtimeUpdateStarted = true;
      await updateManagedClio(releaseTag(version), {
        restartApp: false,
        onProgress: (line) => useUpdateFlowStore.getState().appendLine(line),
      });
    }
    desktopInstallStarted = update !== null;
    if (update) useUpdateFlowStore.getState().setStep('installing');
    await update?.install();
    await update?.close();
    if (availableUpdate === update) availableUpdate = null;
    runtimeRepair = null;
    useUpdateFlowStore.getState().setStep('restarting');
    if (update) {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } else {
      await restartClio();
    }
  } catch (error) {
    useUpdateFlowStore.getState().fail(describeUpdateError(error));
    if (availableUpdate === update) availableUpdate = null;
    runtimeRepair = null;
    await update
      ?.close()
      .catch((closeError: unknown) => console.warn('Could not close failed update', closeError));
    publishUpdateSnapshot({ status: 'error', ...classifyUpdateError(error) });
    if (runtimeUpdateStarted) {
      // Retain the target across recovery; a reconnect must never erase a
      // partially applied update or claim success without checking versions.
      await restartClio().catch((restartError: unknown) =>
        console.warn('Could not restart the runtime after a failed update', restartError),
      );
    } else if (!desktopInstallStarted) {
      clearPendingUpdateMarker();
    }
    throw error;
  } finally {
    installingUpdate = null;
    installingProduct = false;
    publishUpdateSnapshot({ ...updateSnapshot });
  }
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
  if (!inTauri() || isUpdateInFlight(useUpdateFlowStore.getState().step)) return;
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
  toast(
    update.repair
      ? 'The local installation needs repair'
      : `Version ${displayReleaseVersion(update.version)} is available`,
    {
      id: DESKTOP_UPDATE_TOAST_ID,
      description: 'Restart to install the signed update.',
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: `Update ${vocab.agent}`,
        onClick: () => void restartToUpdate(),
      },
    },
  );
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
