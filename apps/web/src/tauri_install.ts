/**
 * Tauri-side helpers for installing/locating the bundled clio backend binary
 * from the desktop shell.
 */
import { invoke, listenTauriEvent } from './tauriApi.js';
import { inTauri } from './tauri_runtime.js';

/**
 * Kick off the first-run "one swoop" clio-agent install. Runs the upstream
 * installer in the Rust supervisor and streams progress back over the
 * `clio:install-*` events (subscribe via {@link onInstallProgress}).
 */
export async function installClio(): Promise<void> {
  if (!inTauri()) return;
  await invoke('install_clio');
}

/**
 * Repair / reinstall the clio-agent runtime. Distinct from Retry: this
 * re-runs the upstream installer with a force flag so a broken runtime is
 * rebuilt from scratch.
 */
export async function repairClio(): Promise<void> {
  if (!inTauri()) return;
  await invoke('repair_clio');
}

/**
 * Reveal the persisted boot log in the OS file manager. Resolves to the
 * revealed path or rejects with the Rust-side error string.
 */
export async function openLogs(): Promise<string | null> {
  if (!inTauri()) return null;
  return invoke<string>('open_logs');
}

/** Payload of `clio:install-failed`. `code` is the installer's exit code, or
 * null when it could not be launched at all. `tail` is the last ~30 lines of
 * combined stdout/stderr. */
export interface InstallFailure {
  code: number | null;
  tail: string;
}

/** Handlers for the streamed first-run install. */
export interface InstallProgressHandlers {
  /** One stdout/stderr line from the installer. */
  onLine: (line: string) => void;
  /** Installer exited 0; the splash should re-poll `get_backend`. */
  onDone: () => void;
  /** Installer exited non-zero or could not launch. */
  onFailed: (failure: InstallFailure) => void;
}

/**
 * Subscribe to the streamed first-run install events emitted by the Rust
 * `install_clio` command. Returns an unsubscribe function that detaches all
 * three listeners.
 */
export function onInstallProgress(handlers: InstallProgressHandlers): () => void {
  if (!inTauri()) return () => undefined;
  const unlisteners = [
    listenTauriEvent<{ line: string }>('clio:install-progress', (p) => handlers.onLine(p.line)),
    listenTauriEvent('clio:install-done', () => handlers.onDone()),
    listenTauriEvent<InstallFailure>('clio:install-failed', (p) => handlers.onFailed(p)),
  ];
  return () => {
    for (const un of unlisteners) un();
  };
}
