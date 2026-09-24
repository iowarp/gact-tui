import { inTauri } from '@/lib/transport/tauri-runtime';
import { vocab } from '@/lib/brand-vocabulary';

export type SshProfile = {
  name: string;
  label?: string;
  hostname?: string;
  user?: string;
  port?: number;
  identity_file?: string;
  jump_hosts?: string[];
  platform?: 'auto' | 'linux' | 'windows';
  install_root?: string;
  managed?: boolean;
};

export type SaveSshProfileInput = {
  name: string;
  label: string;
  hostname: string;
  user: string;
  port: number;
  identity_file: string;
  jump_hosts: string[];
  platform: 'auto' | 'linux' | 'windows';
  install_root: string;
  managed_identity: boolean;
};

/** List resolved OpenSSH profiles after applying product visibility preferences. */
export async function listSshProfiles(): Promise<SshProfile[]> {
  if (!inTauri()) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<SshProfile[]>('ssh_profiles_list');
}

/** Persist only non-secret host configuration through the product's OpenSSH include. */
export async function saveSshProfile(request: SaveSshProfileInput): Promise<SshProfile> {
  if (!inTauri()) throw new Error(`SSH profiles can be saved only in ${vocab.product}.`);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<SshProfile>('ssh_profile_save', { request });
}

/** Hide or reveal an imported profile without editing the user's definition. */
export async function setSshProfileHidden(name: string, hidden: boolean): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('ssh_profile_set_hidden', { name, hidden });
}

/** Delete a profile only when it was created in CLIO's managed include file. */
export async function deleteSshProfile(name: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('ssh_profile_delete', { name });
}

/** Rewrite only the ordered jump route of a profile CLIO saved; imported profiles are refused. */
export async function setSshProfileRoute(name: string, jumpHosts: string[]): Promise<SshProfile> {
  if (!inTauri()) throw new Error(`SSH routes can be saved only in ${vocab.product}.`);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<SshProfile>('ssh_profile_set_route', { name, jumpHosts });
}
