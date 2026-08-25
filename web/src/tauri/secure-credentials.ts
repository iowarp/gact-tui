import { inTauri } from '@/lib/transport/tauri-runtime';

async function invokeCredential<T>(command: string, input: Record<string, string>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke<T>(command, input);
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : 'Secure credential storage is unavailable.');
  }
}

/** Read a connection token from the installed app's operating-system credential store. */
export async function readConnectionCredential(endpoint: string): Promise<string | undefined> {
  if (!inTauri()) return undefined;
  return (await invokeCredential<string | null>('credential_read', { endpoint })) ?? undefined;
}

/** Save a connection token in the installed app's operating-system credential store. */
export async function storeConnectionCredential(endpoint: string, secret: string): Promise<void> {
  if (!inTauri()) return;
  await invokeCredential('credential_store', { endpoint, secret });
}

/** Delete a connection token from the installed app's operating-system credential store. */
export async function deleteConnectionCredential(endpoint: string): Promise<void> {
  if (!inTauri()) return;
  await invokeCredential('credential_delete', { endpoint });
}
