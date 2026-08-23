import { inTauri } from '@/lib/transport/tauri-runtime';

/** Opens only a server-confined document working copy through the native shell. */
export async function openDocumentWorkingCopy(path: string): Promise<boolean> {
  if (!inTauri()) return false;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke<string>('open_document_path', { path });
  return true;
}
