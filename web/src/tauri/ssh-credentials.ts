import { inTauri } from '@/lib/transport/tauri-runtime';

function requireDesktop(): void {
  if (!inTauri()) throw new Error('SSH credentials are available in the installed desktop app.');
}

/** Store an SSH password in the operating-system credential vault. */
export async function storeSshPassword(credentialId: string, secret: string): Promise<void> {
  requireDesktop();
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('ssh_password_store', { credentialId, secret });
}

/** Remove a password when a saved host switches back to key authentication. */
export async function deleteSshPassword(credentialId: string): Promise<void> {
  requireDesktop();
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('ssh_password_delete', { credentialId });
}

/** Store pasted private-key text in CLIO's protected per-user data directory. */
export async function storeSshIdentity(
  credentialId: string,
  privateKey: string,
): Promise<string> {
  requireDesktop();
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('ssh_identity_store', { credentialId, privateKey });
}
