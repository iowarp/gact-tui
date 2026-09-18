import { inTauri } from '@/lib/transport/tauri-runtime';

export type InstallerOptions = {
  version: number;
  web_search: boolean;
  web_search_status: 'not_requested' | 'pending' | 'deployed' | 'needs_attention' | 'configured';
};

/** Read infrastructure choices made in the native desktop installer. */
export async function readInstallerOptions(): Promise<InstallerOptions> {
  if (!inTauri()) {
    return { version: 1, web_search: false, web_search_status: 'not_requested' };
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<InstallerOptions>('read_installer_options');
}

/** Mark install-selected Web Search as registered with the managed agent. */
export async function completeInstallerWebSearch(): Promise<void> {
  if (!inTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('complete_installer_web_search');
}
