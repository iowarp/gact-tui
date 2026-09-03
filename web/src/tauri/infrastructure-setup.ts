import { inTauri } from '@/lib/transport/tauri-runtime';

export type SshProfile = {
  name: string;
  hostname?: string;
  user?: string;
};

export type WebSearchDeployInput = {
  target: 'local' | 'ssh';
  ssh_profile?: string;
  contact_email?: string;
};

export type WebSearchDeployResult = {
  action: 'created' | 'started' | 'already_running';
  target: string;
};

/** Read named OpenSSH profiles from the installed desktop app. */
export async function sshProfiles(): Promise<SshProfile[]> {
  if (!inTauri()) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<SshProfile[]>('infrastructure_ssh_profiles');
}

/** Create or start the supported CLIO Web Search container. */
export async function deployWebSearch(input: WebSearchDeployInput): Promise<WebSearchDeployResult> {
  if (!inTauri()) {
    throw new Error('Automatic deployment is available in the installed desktop app.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<WebSearchDeployResult>('infrastructure_deploy_web_search', { request: input });
}
