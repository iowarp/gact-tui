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

export type ManagedTargetInput = {
  target: 'local' | 'ssh';
  ssh_profile?: string;
};

export type TargetFacts = {
  target: string;
  os: string;
  arch: string;
  accelerator: string;
  docker_available: boolean;
  uv_available: boolean;
};

export type ManagedServiceDefinition = {
  id: 'vllm' | 'llama_cpp' | 'web_search' | 'relay';
  label: string;
  description: string;
  recommended_variant: string;
  variants: Array<{
    id: string;
    label: string;
    version: string;
    install_type: string;
    artifact: string;
    compatible: boolean;
    reason: string;
  }>;
  configuration_fields: Array<{
    id: string;
    label: string;
    placeholder: string;
    required: boolean;
    options?: string[];
  }>;
  supports_stop: boolean;
};

export type ManagedServiceActionInput = ManagedTargetInput & {
  service_id: ManagedServiceDefinition['id'];
  action: 'install' | 'start' | 'status' | 'stop' | 'logs';
  variant_id: string;
  configuration: Record<string, string>;
};

export type ManagedServiceActionResult = {
  service_id: string;
  action: string;
  target: string;
  status: string;
  logs: string;
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

/** Inspect the selected deployment target without changing it. */
export async function preflightTarget(input: ManagedTargetInput): Promise<TargetFacts> {
  if (!inTauri()) throw new Error('Target inspection is available in the installed desktop app.');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<TargetFacts>('infrastructure_preflight', { request: input });
}

/** Return the compiled service drivers and their compatible variants. */
export async function managedServices(
  input: ManagedTargetInput,
): Promise<ManagedServiceDefinition[]> {
  if (!inTauri()) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ManagedServiceDefinition[]>('infrastructure_managed_services', { request: input });
}

/** Run one allowlisted action for one managed service. */
export async function runManagedServiceAction(
  input: ManagedServiceActionInput,
): Promise<ManagedServiceActionResult> {
  if (!inTauri()) throw new Error('Service deployment is available in the installed desktop app.');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ManagedServiceActionResult>('infrastructure_managed_service_action', {
    request: input,
  });
}
