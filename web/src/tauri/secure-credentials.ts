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

/** Read a provider API key from the desktop credential vault. */
export async function readProviderCredential(
  providerId: string,
  apiBase: string,
): Promise<string | undefined> {
  if (!inTauri()) return undefined;
  return (
    (await invokeCredential<string | null>('provider_credential_read', {
      providerId,
      apiBase,
    })) ?? undefined
  );
}

/** Save a provider API key under the provider and normalized endpoint. */
export async function storeProviderCredential(
  providerId: string,
  apiBase: string,
  secret: string,
): Promise<void> {
  if (!inTauri()) return;
  await invokeCredential('provider_credential_store', { providerId, apiBase, secret });
}
