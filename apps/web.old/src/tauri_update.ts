/**
 * Tauri desktop auto-update client.
 *
 * The same SolidJS bundle ships inside the Tauri shell (`@clio/desktop`) and as
 * a pure-web app. Desktop auto-update is a NATIVE concern — it replaces the
 * installed binary via the OS installer — so it is wholly separate from the
 * web SPA "a new build was deployed, refresh" flow in `updateCheck.ts`.
 *
 * On launch the shell asks the GitHub-releases `latest.json` marker (configured
 * in `tauri.conf.json` → `plugins.updater.endpoints`) whether a newer signed
 * build exists. If one does, we surface it and — on the user's confirmation —
 * download + install it and relaunch into the new version.
 *
 * Everything here is gated behind {@link inTauri}: in the browser build there is
 * no `@tauri-apps/plugin-updater` runtime, so the dynamic imports are never
 * reached and the functions resolve to inert no-ops. That keeps this module
 * import-safe in jsdom/vitest and tree-shakeable out of the pure-web entry.
 */
import { inTauri } from './tauri_runtime.js';

/** A pending desktop update discovered by {@link checkForDesktopUpdate}. */
export interface DesktopUpdate {
  /** The version string advertised by the release marker (e.g. "0.8.0"). */
  version: string;
  /** Release notes / body from latest.json, if the marker carried one. */
  body: string | null;
  /**
   * Download the new bundle and run the platform installer, reporting byte
   * progress. Does NOT restart the app — call {@link relaunchApp} after it
   * resolves to boot into the new version.
   */
  downloadAndInstall: (onProgress?: (event: UpdateProgress) => void) => Promise<void>;
}

/** Coarse progress phases surfaced while an update downloads + installs. */
export type UpdateProgress =
  | { phase: 'started'; contentLength: number | null }
  | { phase: 'downloading'; downloaded: number; contentLength: number | null }
  | { phase: 'finished' };

/**
 * Ask the configured updater endpoint whether a newer signed build exists.
 *
 * Returns the pending update (with an install handle) when one is available,
 * or `null` when the app is up to date, when running outside Tauri, or when the
 * check fails (offline, marker missing, signature endpoint unreachable). An
 * update check must never surface an error to the user, so failures resolve to
 * `null` rather than rejecting.
 */
export async function checkForDesktopUpdate(): Promise<DesktopUpdate | null> {
  if (!inTauri()) return null;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update || !update.available) return null;
    return {
      version: update.version,
      body: update.body ?? null,
      downloadAndInstall: async (onProgress) => {
        let downloaded = 0;
        let contentLength: number | null = null;
        await update.downloadAndInstall((event) => {
          if (!onProgress) return;
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength ?? null;
              onProgress({ phase: 'started', contentLength });
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              onProgress({ phase: 'downloading', downloaded, contentLength });
              break;
            case 'Finished':
              onProgress({ phase: 'finished' });
              break;
            default:
              break;
          }
        });
      },
    };
  } catch {
    // Offline, endpoint unreachable, malformed/missing latest.json, plugin not
    // present — all indistinguishable here and all non-fatal. Stay quiet.
    return null;
  }
}

/**
 * Relaunch the app process. Used after {@link DesktopUpdate.downloadAndInstall}
 * to boot into the freshly installed version. No-op outside Tauri.
 */
export async function relaunchApp(): Promise<void> {
  if (!inTauri()) return;
  try {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch {
    // If the process plugin is unavailable the installer's own relaunch (or the
    // user reopening the app) still picks up the new binary; nothing to do.
  }
}

/** Decision callback for {@link runDesktopUpdateCheck}: returns true to install. */
export type ConfirmUpdate = (update: DesktopUpdate) => boolean | Promise<boolean>;

/**
 * Default confirmation prompt for the launch check: a native confirm dialog.
 * Falls back to `false` (skip) in any environment without `window.confirm`.
 */
async function defaultConfirm(update: DesktopUpdate): Promise<boolean> {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return false;
  }
  const note = update.body ? `\n\n${update.body}` : '';
  return window.confirm(
    `A new version (${update.version}) of the desktop app is available. Install and restart now?${note}`,
  );
}

/**
 * Launch-time auto-update entry point. Checks for a desktop update and, if one
 * exists, asks the user (via `confirm`, overridable) whether to install it. On
 * accept it downloads + installs the signed bundle and relaunches into the new
 * version. No-op outside Tauri.
 *
 * Returns `true` if an install was started (the app is about to relaunch),
 * `false` otherwise. Never throws — update failures are swallowed.
 *
 * @param confirm   Decision callback (defaults to a native confirm dialog).
 * @param onProgress Optional download/install progress reporter.
 */
export async function runDesktopUpdateCheck(
  confirm: ConfirmUpdate = defaultConfirm,
  onProgress?: (event: UpdateProgress) => void,
): Promise<boolean> {
  if (!inTauri()) return false;
  const update = await checkForDesktopUpdate();
  if (!update) return false;
  let accepted = false;
  try {
    accepted = await confirm(update);
  } catch {
    accepted = false;
  }
  if (!accepted) return false;
  try {
    await update.downloadAndInstall(onProgress);
    await relaunchApp();
    return true;
  } catch {
    // Download/install/relaunch failed (network drop mid-download, installer
    // error, signature mismatch). Leave the running app untouched; the user can
    // retry on next launch.
    return false;
  }
}
