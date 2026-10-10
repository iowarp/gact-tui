import { inTauri } from '@/lib/transport/tauri-runtime';

export type DocumentApplication = {
  id: string;
  name: string;
  is_default: boolean;
  icon_data_url?: string;
};

async function desktopCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    // Native commands reject with strings; callers and error panels expect an Error.
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/** Read the OS handlers for this file type without launching any application. */
export async function documentApplications(
  name: string,
  mimeType: string,
): Promise<DocumentApplication[]> {
  if (!inTauri()) return [];
  return desktopCommand<DocumentApplication[]>('document_applications', { name, mimeType });
}

/** Open a server-confined working copy in a freshly validated OS handler. */
export async function openDocumentWorkingCopy(path: string, application: string): Promise<void> {
  if (!inTauri()) throw new Error('Opening desktop apps requires the desktop application.');
  await desktopCommand<string>('open_document_path', { path, application });
}

/** Open a desktop copy, including when the connected service uses a remote filesystem. */
export async function openFileBytes(
  name: string,
  bytes: Uint8Array,
  application: string,
): Promise<string> {
  if (!inTauri()) throw new Error('Opening desktop apps requires the desktop application.');
  return desktopCommand<string>('open_file_bytes', { name, bytes: Array.from(bytes), application });
}

/** Reveal an exact local copy even when the OS has no handler for this file type. */
export async function revealFileBytes(name: string, bytes: Uint8Array): Promise<string> {
  if (!inTauri()) throw new Error('Opening a folder requires the desktop application.');
  return desktopCommand<string>('reveal_file_bytes', { name, bytes: Array.from(bytes) });
}
