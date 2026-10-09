import { inTauri } from '@/lib/transport/tauri-runtime';

export type DocumentApplication = {
  id: string;
  name: string;
  is_default: boolean;
  icon_data_url?: string;
};

/** Read the OS handlers for this file type without launching any application. */
export async function documentApplications(
  name: string,
  mimeType: string,
): Promise<DocumentApplication[]> {
  if (!inTauri()) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<DocumentApplication[]>('document_applications', { name, mimeType });
}

/** Open a server-confined working copy in a freshly validated OS handler. */
export async function openDocumentWorkingCopy(path: string, application: string): Promise<void> {
  if (!inTauri()) throw new Error('Opening desktop apps requires the desktop application.');
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke<string>('open_document_path', { path, application });
}

/** Open a desktop copy, including when the connected service uses a remote filesystem. */
export async function openFileBytes(
  name: string,
  bytes: Uint8Array,
  application: string,
): Promise<string> {
  if (!inTauri()) throw new Error('Opening desktop apps requires the desktop application.');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('open_file_bytes', { name, bytes: Array.from(bytes), application });
}
