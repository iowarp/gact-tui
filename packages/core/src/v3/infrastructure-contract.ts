import { z } from 'zod';

export const infrastructureTransportStateSchema = z.enum([
  'connected',
  'reconnecting',
  'reauthentication_required',
  'disconnected',
  'state_unknown',
]);

export const sshRouteSchema = z.object({
  profile: z.string().default(''),
  host: z.string().default(''),
  user: z.string().default(''),
  port: z.number().int().min(1).max(65_535).default(22),
  jump_hosts: z.array(z.string()).default([]),
  identity_file: z.string().default(''),
  platform: z.enum(['auto', 'linux', 'windows']).default('auto'),
});

export const infrastructureTargetSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['local', 'ssh', 'direct']),
  install_root: z.string().default(''),
  ssh: sshRouteSchema.nullish().transform((value) => value ?? undefined),
  transport_state: infrastructureTransportStateSchema,
  auto_reconnect: z.boolean().default(true),
  created_at: z.string(),
  updated_at: z.string(),
});

export const targetFactsSchema = z.object({
  target_id: z.string(),
  label: z.string(),
  os: z.string(),
  arch: z.string(),
  accelerator: z.string(),
  docker_available: z.boolean(),
  docker_installed: z.boolean(),
  uv_available: z.boolean(),
  transport_state: infrastructureTransportStateSchema,
});

const serviceVariantSchema = z.object({
  id: z.string(),
  label: z.string(),
  version: z.string(),
  install_type: z.string(),
  artifact: z.string(),
  compatible: z.boolean(),
  reason: z.string(),
});

const serviceFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  placeholder: z.string(),
  required: z.boolean(),
  options: z.array(z.string()).default([]),
});

export const managedServiceDefinitionSchema = z.object({
  id: z.string(),
  category: z.enum(['model_runtime', 'scientific_service', 'remote_access']),
  label: z.string(),
  description: z.string(),
  recommended_variant: z.string(),
  variants: z.array(serviceVariantSchema),
  configuration_fields: z.array(serviceFieldSchema).default([]),
  supports_stop: z.boolean(),
  state: z.enum(['running', 'stopped', 'not_installed', 'unknown']),
  connection_url: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  connection_strategy: z
    .enum(['loopback', 'direct', 'ssh_forward', 'external'])
    .nullish()
    .transform((value) => value ?? undefined),
});

export const managedServiceCatalogSchema = z.object({
  facts: targetFactsSchema,
  services: z.array(managedServiceDefinitionSchema),
});

export const infrastructureOperationSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  target_id: z.string(),
  action: z.string(),
  state: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  progress: z.string(),
  logs: z.string(),
  error: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  created_at: z.string(),
  updated_at: z.string(),
});

export const externalServiceConnectionSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  label: z.string(),
  url: z.string(),
  credential_ref: z.string().default(''),
  managed: z.literal(false),
  reachable: z
    .boolean()
    .nullish()
    .transform((value) => value ?? undefined),
  checked_at: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  created_at: z.string(),
});

export type SshRoute = z.infer<typeof sshRouteSchema>;
export type InfrastructureTarget = z.infer<typeof infrastructureTargetSchema>;
export type TargetFacts = z.infer<typeof targetFactsSchema>;
export type ManagedServiceDefinition = z.infer<typeof managedServiceDefinitionSchema>;
export type ManagedServiceCatalog = z.infer<typeof managedServiceCatalogSchema>;
export type InfrastructureOperation = z.infer<typeof infrastructureOperationSchema>;
export type ExternalServiceConnection = z.infer<typeof externalServiceConnectionSchema>;

export type CreateInfrastructureTargetInput = {
  label: string;
  kind: 'ssh' | 'direct';
  install_root?: string;
  ssh?: Partial<SshRoute>;
  auto_reconnect?: boolean;
};

export type ServiceActionInput = {
  target_id: string;
  action: 'install' | 'start' | 'status' | 'stop' | 'logs' | 'reinstall' | 'uninstall';
  variant_id: string;
  configuration: Record<string, string>;
};

export type ExternalServiceConnectionInput = {
  service_id: string;
  label: string;
  url: string;
  credential_ref?: string;
};
