import { inTauri } from '@/lib/transport/tauri-runtime';

export type DocumentApplication = 'word' | 'powerpoint' | 'excel';

/** Installed named editors; discovery never launches an app or returns executable paths. */
export async function documentApplications(): Promise<DocumentApplication[]> {
  if (!inTauri()) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<DocumentApplication[]>('document_applications');
}

/** Opens only a server-confined working copy in a selected app or the OS default. */
export async function openDocumentWorkingCopy(
  path: string,
  application?: DocumentApplication,
): Promise<boolean> {
  if (!inTauri()) return false;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke<string>('open_document_path', { path, application });
  return true;
}
