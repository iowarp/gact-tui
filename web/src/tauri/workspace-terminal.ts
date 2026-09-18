import { inTauri } from '@/lib/transport/tauri-runtime';

/** Open a native terminal rooted at an existing CLIO workspace. */
export async function openWorkspaceTerminal(path: string): Promise<string> {
  if (!inTauri()) {
    throw new Error('Workspace terminals are available in the installed desktop app.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('open_workspace_terminal', { path });
}
