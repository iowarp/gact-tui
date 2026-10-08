import { z } from 'zod';
import { contextSizingSpecSchema } from './context-sizing-contract.js';
import { modelAcquisitionSchema } from './model-acquisition-contract.js';

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

/** One container runtime as the target reported it (usable, or why not). */
export const containerRuntimeFactSchema = z.object({
  name: z.enum(['docker', 'podman', 'apptainer']),
  installed: z.boolean(),
  usable: z.boolean(),
  version: z.string().default(''),
  reason: z
    .enum(['not_installed', 'unusable', 'not_probed'])
    .nullish()
    .transform((value) => value ?? undefined),
  /** Why an installed runtime is unusable; absent from older servers. */
  failure: z
    .enum(['not_running', 'permission_denied', 'timed_out', 'unknown'])
    .nullish()
    .catch(undefined)
    .transform((value) => value ?? undefined),
  detail: z.string().default(''),
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
  container_runtimes: z.array(containerRuntimeFactSchema).default([]),
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
  variants: z.array(z.string()).optional(),
});

/** A tweakable server parameter as the service's driver declares it. */
export const serverParameterSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  kind: z.enum(['integer', 'number', 'choice', 'text']),
  delivery: z.enum(['flag', 'env']),
  name: z.string(),
  minimum: z
    .number()
    .nullish()
    .transform((value) => value ?? undefined),
  maximum: z
    .number()
    .nullish()
    .transform((value) => value ?? undefined),
  options: z.array(z.string()).default([]),
  variants: z.array(z.string()).default([]),
  default_behavior: z.string().default(''),
  effective_key: z.string().default(''),
  /** The context parameter's Number / Max / Fit-to-GPU control; absent elsewhere. */
  context_sizing: contextSizingSpecSchema.nullish().transform((value) => value ?? undefined),
});

/** A server parameter as the running server has it in force, and its source. */
export const effectiveParameterSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  source: z.enum(['server_report', 'container_config', 'launch_request', 'engine_default']),
  detail: z.string().default(''),
});

/** One thing a deployment created on its target; uninstall removes it. */
export const ownedResourceSchema = z.object({
  kind: z.enum(['container', 'image', 'directory', 'parent_directory', 'instance_logs']),
  ref: z.string(),
  runtime: z
    .enum(['docker', 'podman', 'apptainer'])
    .nullish()
    .transform((value) => value ?? undefined),
  created_at: z.string().default(''),
});

/**
 * Who can use a managed model server: protected by the key the service made
 * for it (and sends itself), shared with no key by choice, or not protected
 * (Ollama has no key support, or the server did not refuse a request without
 * its key). `detail` is the plain sentence to show.
 */
export const serviceAccessSchema = z.object({
  mode: z.enum(['api_key', 'shared', 'unprotected']),
  detail: z.string(),
  verified: z.boolean().default(false),
});

const serviceObservationSchema = z.object({
  definition_version: z.string(),
  configuration_revision: z.string(),
  phase: z.enum(['not_installed', 'installing', 'stopped', 'running', 'failed', 'interrupted']),
  installed: z.boolean(),
  running: z.boolean(),
  serving: z.boolean(),
  worker_alive: z.boolean(),
  provenance_ingesting: z.boolean(),
  attention_verified: z.boolean(),
  evidence_directory: z.string(),
  effective_artifacts: z.record(z.string(), z.string()).optional(),
  error: z.string().nullish(),
  observed_at: z.number(),
});

export const managedServiceDefinitionSchema = z.object({
  id: z.string(),
  category: z.enum(['model_runtime', 'scientific_service', 'remote_access', 'monitoring']),
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
  parameters: z.array(serverParameterSchema).default([]),
  effective_parameters: z.array(effectiveParameterSchema).default([]),
  configuration: z.record(z.string(), z.string()).default({}),
  owned_resources: z.array(ownedResourceSchema).default([]),
  /** Whether this engine can be protected by an API key (Ollama cannot). */
  supports_api_key: z.boolean().default(false),
  /** Who can use the installed deployment. */
  access: serviceAccessSchema.nullish().transform((value) => value ?? undefined),
  definition_version: z.string().optional(),
  observation: serviceObservationSchema.nullish().transform((value) => value ?? undefined),
});

export const managedServiceCatalogSchema = z.object({
  facts: targetFactsSchema,
  services: z.array(managedServiceDefinitionSchema),
});

/**
 * A healthy CLIO the claim step found but left running untouched: set only
 * when `error` is `clio_deploy_version_conflict` (a different root or
 * version than this desktop would install, and no `on_conflict` was given).
 * The caller re-issues the same action with `configuration.on_conflict` set
 * to `"connect"` (adopt it as-is) or `"replace"` (stop it and install).
 */
export const versionConflictDetailSchema = z.object({
  installed_version: z.string(),
  pid: z.string(),
  // "healthy" answered its own health check; "unresponsive"/"unknown" did
  // not (or could not be asked) -- never, on its own, a reason it was
  // stopped. A `"connect"` answer only makes sense when `"healthy"`.
  health: z.enum(['healthy', 'unresponsive', 'unknown']).default('unknown'),
  target_version: z.string().optional(),
  owner: z.string().optional(),
  port: z.number().optional(),
});

const nullishNumber = z
  .number()
  .nullish()
  .transform((value) => value ?? undefined);
const nullishString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);

/**
 * How far one step is, as far as it can honestly be measured: `fraction` is
 * set only when `determinate`; otherwise the step shows an indeterminate bar
 * with whatever counter is known.
 */
export const operationStepProgressSchema = z.object({
  determinate: z.boolean().default(false),
  unit: z
    .enum(['bytes', 'layers', 'packages', 'percent', 'items'])
    .nullish()
    .catch(undefined)
    .transform((value) => value ?? undefined),
  current: nullishNumber,
  total: nullishNumber,
  fraction: nullishNumber,
  detail: z.string().default(''),
});

export const operationStepStateSchema = z
  .enum(['pending', 'running', 'succeeded', 'reused', 'skipped', 'failed', 'cancelled'])
  .catch('pending');

/** One ordered step of a long infrastructure operation. */
export const operationStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  state: operationStepStateSchema.default('pending'),
  started_at: nullishString,
  finished_at: nullishString,
  elapsed_seconds: nullishNumber,
  progress: operationStepProgressSchema.nullish().transform((value) => value ?? undefined),
  message: z.string().default(''),
});

/** A verified install step the reuse preflight skipped. */
export const operationReuseSchema = z.object({
  kind: z.string(),
  thing: z.string(),
  identity: z.string(),
  path: z.string().default(''),
  size_bytes: nullishNumber,
  saved_seconds: nullishNumber,
  message: z.string().default(''),
  step: nullishNumber,
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
  conflict: versionConflictDetailSchema.nullish().transform((value) => value ?? undefined),
  created_at: z.string(),
  updated_at: z.string(),
  // Structured progress; every field defaults so older services still decode.
  steps: z.array(operationStepSchema).default([]),
  current_step: nullishNumber,
  started_at: nullishString,
  finished_at: nullishString,
  elapsed_seconds: nullishNumber,
  reused: z.array(operationReuseSchema).default([]),
  from_scratch: z.boolean().default(false),
  /** Newest event id on the live stream; resume from it with Last-Event-ID. */
  log_cursor: z.number().default(0),
});

/** One live log line of an operation (`operation.log`). */
export const operationLogLineSchema = z.object({
  line: z.string(),
  stream: z.string().default('stdout'),
  step: nullishNumber,
});

/** `GET /v1/infrastructure/operations/{id}/log?after=&limit=`. */
export const operationLogPageSchema = z.object({
  operation_id: z.string(),
  state: z.string(),
  lines: z.array(
    operationLogLineSchema.extend({ id: z.number(), at: z.string().default('') }),
  ),
  next_cursor: z.number(),
  truncated: z.boolean().default(false),
  complete: z.boolean().default(false),
});

/** The progress part of an operation, as `operation.progress` publishes it. */
export const operationProgressPatchSchema = infrastructureOperationSchema
  .pick({
    state: true,
    progress: true,
    steps: true,
    current_step: true,
    reused: true,
    started_at: true,
    elapsed_seconds: true,
    from_scratch: true,
    error: true,
  })
  .partial();

/**
 * One decoded frame of `GET /v1/infrastructure/operations/{id}/events`.
 * `id` is the resumable event id (0 for connection-only frames: snapshot,
 * heartbeat, gap).
 */
export type InfrastructureOperationEvent =
  | { id: number; type: 'operation.snapshot'; operation: InfrastructureOperation }
  | { id: number; type: 'operation.progress'; progress: OperationProgressPatch }
  | { id: number; type: 'operation.log'; log: OperationLogLine }
  | { id: number; type: 'operation.reuse'; reuse: OperationReuse }
  | { id: number; type: 'operation.completed'; operation: InfrastructureOperation }
  | { id: number; type: 'stream.gap'; first_retained_id?: number }
  | { id: number; type: 'server.heartbeat' };

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
export const infrastructureInventorySchema = z.object({
  targets: z.array(infrastructureTargetSchema),
  services: z.array(
    z.object({
      id: z.string(),
      target_id: z.string(),
      service_id: z.string(),
      state: z.enum(['running', 'stopped', 'not_installed', 'unknown']),
      connection_url: z.string().nullish(),
      updated_at: z.string(),
      configuration: z.record(z.string()).default({}),
    }),
  ),
  connections: z.array(externalServiceConnectionSchema),
  operations: z.array(infrastructureOperationSchema),
  model_acquisitions: z.array(modelAcquisitionSchema).default([]),
});
export type InfrastructureInventory = z.infer<typeof infrastructureInventorySchema>;
export type InfrastructureTarget = z.infer<typeof infrastructureTargetSchema>;
export type TargetFacts = z.infer<typeof targetFactsSchema>;
export type ContainerRuntimeFact = z.infer<typeof containerRuntimeFactSchema>;
export type ServerParameter = z.infer<typeof serverParameterSchema>;
export type EffectiveParameter = z.infer<typeof effectiveParameterSchema>;
export type OwnedResource = z.infer<typeof ownedResourceSchema>;
export type ServiceAccess = z.infer<typeof serviceAccessSchema>;
export type ManagedServiceDefinition = z.infer<typeof managedServiceDefinitionSchema>;
export type ManagedServiceCatalog = z.infer<typeof managedServiceCatalogSchema>;
export type InfrastructureOperation = z.infer<typeof infrastructureOperationSchema>;
export type OperationStep = z.infer<typeof operationStepSchema>;
export type OperationStepState = z.infer<typeof operationStepStateSchema>;
export type OperationStepProgress = z.infer<typeof operationStepProgressSchema>;
export type OperationReuse = z.infer<typeof operationReuseSchema>;
export type OperationLogLine = z.infer<typeof operationLogLineSchema>;
export type OperationLogPage = z.infer<typeof operationLogPageSchema>;
export type OperationProgressPatch = z.infer<typeof operationProgressPatchSchema>;
export type VersionConflictDetail = z.infer<typeof versionConflictDetailSchema>;
export type ExternalServiceConnection = z.infer<typeof externalServiceConnectionSchema>;

export type CreateInfrastructureTargetInput = {
  label: string;
  kind: 'ssh' | 'direct';
  install_root?: string;
  ssh?: Partial<SshRoute>;
  auto_reconnect?: boolean;
};

/**
 * Install/reinstall configuration flag that bypasses every reuse check for one
 * operation (fresh pulls, rebuilt environments). CLIO never persists it.
 */
export const INSTALL_FROM_SCRATCH_KEY = 'install.from_scratch';

export type ServiceActionInput = {
  target_id: string;
  action:
    | 'install'
    | 'start'
    | 'status'
    | 'stop'
    | 'logs'
    | 'reinstall'
    | 'uninstall'
    | 'delete_data'
    | 'verify';
  variant_id: string;
  configuration: Record<string, string>;
};

export type ExternalServiceConnectionInput = {
  service_id: string;
  label: string;
  url: string;
  credential_ref?: string;
};
