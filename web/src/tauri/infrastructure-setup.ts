import { inTauri } from '@/lib/transport/tauri-runtime';
import { vocab } from '@/lib/brand-vocabulary';

export type SshProfile = {
  name: string;
  hostname?: string;
  user?: string;
};

export type SshTargetInput = {
  ssh_profile?: string;
  ssh_host?: string;
  ssh_user?: string;
  ssh_port?: number;
  ssh_identity_file?: string;
  ssh_auth_method?: 'key' | 'password';
  ssh_credential_id?: string;
};

export type WebSearchDeployInput = {
  target: 'local' | 'ssh';
} & SshTargetInput & {
    contact_email?: string;
  };

export type WebSearchDeployResult = {
  action: 'created' | 'started' | 'already_running';
  target: string;
};

export type ManagedTargetInput = {
  target: 'local' | 'ssh';
  /** Optional absolute install/runtime root on the remote host. */
  install_root?: string;
} & SshTargetInput;

export type ClioDeployInput = ManagedTargetInput;

export type ClioDeployResult = {
  target: string;
  remote_port: number;
  status: 'installed' | 'ready';
};

export type TargetFacts = {
  target: string;
  os: string;
  arch: string;
  accelerator: string;
  docker_available: boolean;
  docker_installed: boolean;
  uv_available: boolean;
};

export type ManagedServiceDefinition = {
  id: 'vllm' | 'llama_cpp' | 'web_search' | 'relay';
  category: 'model_runtime' | 'scientific_service' | 'remote_access';
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
  state: 'running' | 'stopped' | 'not_installed' | 'unknown';
  connection_url?: string | null;
};

export type ManagedServiceCatalog = {
  facts: TargetFacts;
  services: ManagedServiceDefinition[];
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

/** Install and start a pinned CLIO agent on an SSH target. */
export async function deployClio(input: ClioDeployInput): Promise<ClioDeployResult> {
  if (!inTauri()) {
    throw new Error(`Remote ${vocab.agent} deployment is available in the installed desktop app.`);
  }
  if (input.target !== 'ssh') {
    throw new Error(`Use the desktop-managed ${vocab.agent} service for this computer.`);
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ClioDeployResult>('infrastructure_deploy_clio', { request: input });
}

/** Inspect the selected deployment target without changing it. */
export async function preflightTarget(input: ManagedTargetInput): Promise<TargetFacts> {
  if (!inTauri()) throw new Error('Target inspection is available in the installed desktop app.');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<TargetFacts>('infrastructure_preflight', { request: input });
}

/** Inspect the target once and return its compiled service drivers. */
export async function managedServiceCatalog(
  input: ManagedTargetInput,
): Promise<ManagedServiceCatalog> {
  if (!inTauri()) {
    throw new Error('Service inspection is available in the installed desktop app.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ManagedServiceCatalog>('infrastructure_managed_service_catalog', {
    request: input,
  });
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
