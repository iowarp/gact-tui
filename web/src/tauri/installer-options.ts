import { inTauri } from '@/lib/transport/tauri-runtime';

/**
 * `web_search`'s possible states. v1 installers recorded a separate
 * `web_search: boolean` alongside this status; v2 folds both into this one
 * field — `not_requested` now carries what used to be `web_search: false`.
 */
export type WebSearchInstallStatus =
  | 'not_requested'
  | 'pending'
  | 'deployed'
  | 'needs_attention'
  | 'configured';

/**
 * `llama_cpp`'s possible states. The installer never bundles or installs a
 * llama.cpp runtime itself — this only records whether the user asked for one
 * on the Infrastructure page, so the app can prompt to finish setup.
 */
export type LlamaCppInstallStatus = 'requested' | 'not_requested';

export type InstallerOptions = {
  schema: number;
  web_search: WebSearchInstallStatus;
  llama_cpp: LlamaCppInstallStatus;
  clio_kit: 'bundled';
  /**
   * `undefined` (or empty) means "no installer preference recorded" — the
   * file was missing/unreadable, or a fully unattended `/S` install skipped
   * the wizard entirely. Callers must leave provider visibility untouched in
   * that case rather than guessing a default set (no silent fallback).
   */
  provider_ids?: string;
  /** Pre-v4 compatibility; current installers write provider_ids. */
  provider_families?: string;
  /**
   * The installer-options "revision" NSIS stamps on every real (non-passive,
   * non-update) install/reinstall. Consumers use it to apply provider
   * visibility exactly once per install (see
   * `applyInstallerProviderVisibility` in `installer-infrastructure.ts`).
   * `undefined` for files written before this field existed.
   */
  installed_at?: string;
};

/**
 * Used only outside Tauri (e.g. the plain web client, which has no native
 * installer at all). It intentionally records NO provider preference —
 * `provider_ids` and `installed_at` are both absent — so the caller leaves
 * provider visibility untouched instead of assuming a desktop-installer
 * default that doesn't apply here.
 */
const DEFAULT_INSTALLER_OPTIONS: InstallerOptions = {
  schema: 4,
  web_search: 'not_requested',
  llama_cpp: 'not_requested',
  clio_kit: 'bundled',
};

/** Read infrastructure choices made in the native desktop installer. */
export async function readInstallerOptions(): Promise<InstallerOptions> {
  if (!inTauri()) return DEFAULT_INSTALLER_OPTIONS;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<InstallerOptions>('read_installer_options');
}

/** Mark install-selected Web Search as registered with the managed agent. */
export async function completeInstallerWebSearch(): Promise<void> {
  if (!inTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('complete_installer_web_search');
}
