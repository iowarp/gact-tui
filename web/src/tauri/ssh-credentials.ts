/** Store a pasted private key in CLIO Desktop's protected per-user data directory. */
export async function storeSshIdentity(
  credentialId: string,
  privateKey: string,
): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('ssh_identity_store', { credentialId, privateKey });
}
