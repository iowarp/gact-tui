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
  provider_families: string;
};

const DEFAULT_INSTALLER_OPTIONS: InstallerOptions = {
  schema: 3,
  web_search: 'not_requested',
  llama_cpp: 'not_requested',
  clio_kit: 'bundled',
  provider_families: 'openai',
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
