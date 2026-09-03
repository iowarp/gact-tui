import { z } from 'zod';
import { A2UI_VERSION, PROTOCOL_VERSION } from './protocol-versions.js';
import { forwardCompatibleEnum } from './schema-utils.js';

export * from './message-schemas.js';

export const degradationSchema = z.object({
  code: z.string(),
  reason: z.string(),
  capability: z.string().optional(),
  recoverable: z.boolean().default(false),
});

export const provenanceSchema = z.object({
  source: forwardCompatibleEnum(['server', 'provider', 'connection', 'unavailable']),
  observed_at: z.string(),
  stale: z.boolean(),
  reason: z.string().optional(),
});

export const capabilitiesSchema = z.object({
  service: z
    .object({
      name: z.string(),
      version: z.string(),
    })
    .optional(),
  gact_versions: z.array(z.string()),
  a2ui_versions: z.array(z.string()).default([]),
  replay: z.object({
    supported: z.boolean(),
    retention: z.number().int().nonnegative().optional(),
  }),
  capabilities: z.record(z.string(), z.unknown()),
  degradations: z.array(degradationSchema).default([]),
  model_catalog: provenanceSchema,
  active_model: z
    .object({
      provider_id: z.string(),
      model_id: z.string(),
      effort: z.string().optional(),
    })
    .optional(),
});

export const providerDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  auth_methods: z.array(z.string()).default([]),
  is_authenticated: z.boolean().default(false),
  default_model: z.string().optional(),
  api_base: z.string().optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const providerModelSchema = z.object({
  id: z.string(),
  name: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  label: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  description: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  context_window: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((value) => value ?? undefined),
  output_limit: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((value) => value ?? undefined),
  context_source: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
});

export const languageModelPresetSchema = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.string(),
  api_base: z.string().optional(),
  suggested_model: z.string().optional(),
  requires_api_key: z.boolean().default(false),
  auth_method: z.string().optional(),
  is_authenticated: z.boolean().default(false),
  description: z.string().optional(),
  status: z.string().optional(),
  status_message: z.string().optional(),
  supports_live_catalog: z.boolean().default(false),
  supports_vision: z.boolean().default(false),
});

export const languageModelConfigurationSchema = z.object({
  configured: z.boolean(),
  provider: z.string(),
  api_base: z.string(),
  model: z.string(),
  temperature: z.number().optional(),
  max_tokens: z.number().int().positive().optional(),
  thinking_level: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  thinking_effective: z.string().optional(),
  state: z.string().optional(),
  status_message: z.string().optional(),
  error: z.string().optional(),
  presets: z.array(languageModelPresetSchema).default([]),
});

export const permissionLedgerItemSchema = z
  .object({
    id: z.string(),
    session_id: z.string(),
    tool_call: z.object({
      tool_name: z.string(),
      input: z.unknown().optional(),
    }),
    summary: z.string().default('Protected action'),
    risk: forwardCompatibleEnum(['low', 'medium', 'high']).optional(),
    reason: z.string().optional(),
    created_at: z.string(),
    status: z.string(),
    action: forwardCompatibleEnum(['allow', 'deny', 'allow_session', 'allow_workspace']).optional(),
    resolved_at: z.string().optional(),
  })
  .transform((value) => ({
    id: value.id,
    session_id: value.session_id,
    tool_name: value.tool_call.tool_name,
    input: value.tool_call.input,
    summary: value.summary,
    risk: value.risk,
    reason: value.reason,
    created_at: value.created_at,
    status: value.status,
    action: value.action,
    resolved_at: value.resolved_at,
  }));

export const userQuestionSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  prompt: z.string(),
  status: forwardCompatibleEnum(['pending', 'answered', 'cancelled', 'expired']),
  kind: forwardCompatibleEnum(['freeform', 'choice', 'confirmation']).default('freeform'),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string().default(''),
        description: z.string().optional(),
      }),
    )
    .default([]),
  allow_freeform: z.boolean().default(false),
  answer: z.string().optional(),
  selected_options: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
  expires_at: z.string().optional(),
});

export const pendingInteractionSchema = z.object({
  id: z.string(),
  kind: forwardCompatibleEnum(['question', 'permission', 'a2ui', 'mcp_task_input']),
  owner_session_id: z.string(),
  attended_session_id: z.string(),
  task_id: z.string().optional(),
  status: forwardCompatibleEnum(['pending', 'answered', 'cancelled', 'expired']),
  title: z.string(),
  prompt: z.string().optional(),
  source: z.object({
    protocol: forwardCompatibleEnum(['native', 'mcp']),
    tool_name: z.string().optional(),
    invocation_id: z.string().optional(),
    surface_id: z.string().optional(),
  }),
  created_at: z.string(),
  payload: z
    .object({
      question_id: z.string().optional(),
      question_kind: forwardCompatibleEnum(['freeform', 'choice', 'confirmation']).optional(),
      options: z
        .array(
          z.object({
            label: z.string(),
            value: z.string().default(''),
            description: z.string().optional(),
          }),
        )
        .optional(),
      allow_freeform: z.boolean().optional(),
      expires_at: z.string().optional(),
      input_key: z.string().optional(),
      permission_id: z.string().optional(),
      tool_call: z
        .object({
          tool_name: z.string().optional(),
          input: z.unknown().optional(),
        })
        .optional(),
      revision: z.number().int().nonnegative().optional(),
      server_id: z.string().optional(),
      awaiting_question: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
  actions: z.array(z.string()).optional(),
});

export const approvalRequestSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  run_id: z.string().optional(),
  tool_name: z.string(),
  input: z.unknown().optional(),
  summary: z.string(),
  reason: z.string().optional(),
  risk: forwardCompatibleEnum(['low', 'medium', 'high']).optional(),
  status: forwardCompatibleEnum(['pending', 'approved', 'denied', 'cancelled']),
  action: forwardCompatibleEnum(['allow', 'deny', 'allow_session', 'allow_workspace']).optional(),
  created_at: z.string(),
  resolved_at: z.string().optional(),
});

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().optional(),
  display_name: z.string(),
  path: z.string(),
  connection_id: z.string(),
  pinned: z.boolean().default(false),
  source_folders: z
    .array(
      z.object({
        path: z.string(),
        name: z.string(),
        primary: z.boolean(),
      }),
    )
    .default([]),
});

export const runStateSchema = forwardCompatibleEnum([
  'queued',
  'running',
  'waiting_permission',
  'waiting_user',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
]);

/** Maps SEP-2663 operational states onto run states; anything unrecognized stays typed `unknown`. */
export const operationalRunStateSchema = z
  .string()
  .transform((value): z.infer<typeof runStateSchema> => {
    if (value === 'working') return 'running';
    if (value === 'input_required') return 'waiting_user';
    return runStateSchema.parse(value);
  });

export const operationalRunSchema = z.object({
  handle_id: z.string(),
  task_id: z.string(),
  run_label: z.string(),
  live_state: operationalRunStateSchema,
  status: z.string(),
  protocol_status: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  status_reason: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  host: z.string(),
  placement: z.string(),
  parent_session_id: z.string(),
  child_session_id: z
    .string()
    .nullish()
    .transform((value) => value || undefined),
  created_at: z.string(),
  updated_at: z.string(),
  detached: z.boolean(),
  source: forwardCompatibleEnum(['agent_task', 'mcp_task', 'relay_job']),
  ticker: z.object({
    state: operationalRunStateSchema,
    updated_at: z.string(),
    path: z.string().optional(),
  }),
});

export const sessionSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  title: z.string(),
  state: runStateSchema,
  created_at: z.string(),
  updated_at: z.string(),
  last_interaction_at: z.string().optional(),
  message_count: z.number().int().nonnegative().optional(),
  provider_id: z.string().optional(),
  model_id: z.string().optional(),
  effort: z.string().optional(),
  branch: z.string().optional(),
  parent_session_id: z.string().optional(),
  agent_id: z.string().optional(),
  active_blueprint_id: z.string().optional(),
  active_blueprint_name: z.string().optional(),
  active_blueprint_version: z.string().optional(),
  active_blueprint_scope: z.string().optional(),
  mode: forwardCompatibleEnum(['plan', 'edit', 'architect']).default('edit'),
  edit_mode: forwardCompatibleEnum(['diff', 'whole', 'patch']).default('diff'),
  routing_mode: forwardCompatibleEnum(['auto', 'chat', 'experts', 'reasoning_only']).default(
    'auto',
  ),
  approval_mode: forwardCompatibleEnum([
    'ask',
    'auto-edits',
    'bypass',
    'ai-review',
    'spotter-ai',
  ]).default('ask'),
  pinned: z.boolean().default(false),
  archived: z.boolean().default(false),
});
export const sessionDefaultsSchema = z.object({
  provider_id: z.string().default(''),
  model_id: z.string().default(''),
  effort: forwardCompatibleEnum(['off', 'low', 'medium', 'high']).default('medium'),
  mode: forwardCompatibleEnum(['plan', 'edit', 'architect']).default('edit'),
  edit_mode: forwardCompatibleEnum(['diff', 'whole', 'patch']).default('diff'),
  routing_mode: forwardCompatibleEnum(['auto', 'chat', 'experts', 'reasoning_only']).default(
    'auto',
  ),
  approval_mode: forwardCompatibleEnum([
    'ask',
    'auto-edits',
    'bypass',
    'ai-review',
    'spotter-ai',
  ]).default('ask'),
  blueprint_id: z.string().default(''),
});

export const scheduledTurnSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  question: z.string(),
  enabled: z.boolean().default(true),
  created_at: z.string().default(''),
  cron: z.string().default(''),
  timezone: z.string().default('UTC'),
  recurring: z.boolean().default(true),
  run_at: z.string().default(''),
  next_fire_at: z.string().default(''),
  last_fired_at: z.string().default(''),
  fire_count: z.number().int().nonnegative().default(0),
  max_fires: z.number().int().nonnegative().default(0),
  until: z.string().default(''),
  overlap_policy: forwardCompatibleEnum(['queue', 'skip']).default('queue'),
  retry_count: z.number().int().nonnegative().default(0),
  last_error: z.string().default(''),
  disabled_reason: z.string().default(''),
});

export const scheduledTurnsSchema = z.object({
  schedules: z.array(scheduledTurnSchema).default([]),
  cron_timezone: z.string().default('UTC'),
});

export const runSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  state: runStateSchema,
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  elapsed_ms: z.number().nonnegative().optional(),
  summary: z.string().optional(),
});

export const turnAttemptSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  source_message_id: z.string(),
  status: forwardCompatibleEnum([
    'recorded',
    'queued',
    'running',
    'completed',
    'failed',
    'cancelled',
  ]),
  created_at: z.string(),
  updated_at: z.string(),
  notes: z.string().optional(),
  model: z
    .object({
      provider_id: z.string().optional(),
      model_id: z.string().optional(),
    })
    .optional(),
  warning: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const workspaceFileEntrySchema = z.object({
  path: z.string(),
  type: forwardCompatibleEnum(['file', 'dir']),
  internal: z.boolean().default(false),
  size: z.number().int().nonnegative().optional(),
  modified: z.string().optional(),
});

export const agentBlueprintSchema = z
  .object({
    id: z.string(),
    version: z.string().default(''),
    title: z.string(),
    display_name: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    scope: z.string().default('unknown'),
    enabled: z.boolean().default(false),
    validation_errors: z.array(z.string()).default([]),
    kind: forwardCompatibleEnum(['blueprint', 'pack']).default('blueprint'),
    metadata: z.record(z.unknown()).default({}),
  })
  .transform((value) => ({
    ...value,
    display_name: value.display_name ?? value.name ?? value.title,
  }));

export const agentBlueprintSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  ref: z.string().optional(),
  commit: z.string().optional(),
  pinned_commit: z.string().optional(),
  source_kind: z.string().optional(),
  status: z.string(),
  error: z.string().optional(),
  added_at: z.string().optional(),
  updated_at: z.string().optional(),
  available_blueprints: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        version: z.string().optional(),
        kind: forwardCompatibleEnum(['blueprint', 'pack']).default('blueprint'),
        enabled: z.boolean().default(false),
        validation_errors: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export const relayStatusSchema = z.object({
  configured: z.boolean(),
  mcp_url: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  http_url: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  credential_configured: z.boolean().optional(),
  configuration_scope: forwardCompatibleEnum(['none', 'server', 'agent_run']).optional(),
  can_manage: z.boolean().optional(),
  host: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  reachable: z
    .boolean()
    .nullish()
    .transform((value) => value ?? undefined),
  checked_at: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  reason: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  detail: z.string().optional(),
  details: z.record(z.string(), z.unknown()).default({}),
});

export const toolCatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  server_id: z.string().optional(),
  source: z.string().optional(),
  status: z.string().optional(),
  enabled: z.boolean().optional(),
  owner: z.string().optional(),
  tags: z.array(z.string()).default([]),
  visible_to: z.array(z.string()).default([]),
});

export const mcpServerDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  transport: z.string().optional(),
  tools_count: z.number().int().nonnegative().default(0),
  tools: z
    .array(z.union([z.string(), z.object({ name: z.string() }).transform((row) => row.name)]))
    .default([]),
  error: z.string().optional(),
  source: z.string().optional(),
  enabled: z.boolean().optional(),
  agent_blueprint_id: z.string().optional(),
  agent_blueprint_name: z.string().optional(),
  session_id: z.string().optional(),
  spec: z.record(z.string(), z.unknown()).default({}),
});

export const agentDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(''),
  source: z.string().default('unknown'),
  enabled: z.boolean().default(true),
  validation_errors: z.array(z.string()).default([]),
  parent_id: z.string().default(''),
  system_prompt: z.string().default(''),
  prompt_id: z.string().default(''),
  prompt_profile: z.string().default(''),
  default_provider: z.string().default(''),
  default_model: z.string().default(''),
  api_base: z.string().default(''),
  credential_ref: z.string().default(''),
  transport: z.string().default(''),
  parameters: z.record(z.string(), z.unknown()).default({}),
  module: z.record(z.string(), z.unknown()).default({}),
  signature: z.record(z.string(), z.unknown()).default({}),
  structured_outputs: z.record(z.string(), z.unknown()).default({}),
  fanout: z.record(z.string(), z.unknown()).default({}),
  tools: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  commands: z.array(z.string()).default([]),
  capability_refs: z.array(z.record(z.string(), z.unknown())).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  tier: z.number().int().nonnegative().default(0),
  specialization: z.string().default(''),
  keywords: z.array(z.string()).default([]),
});

export const promptProfileDefinitionSchema = z.object({
  name: z.string(),
  text: z.string(),
  scope: z.string().default('unknown'),
  source_path: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  checksum: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const promptDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  default_profile: z.string().optional(),
  profiles: z.record(z.string(), promptProfileDefinitionSchema).default({}),
  scope: z.string().default('unknown'),
  source_path: z.string().optional(),
  enabled: z.boolean().default(false),
  validation_errors: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const resolvedPromptDefinitionSchema = z.object({
  id: z.string(),
  profile: z.string(),
  text: z.string(),
  title: z.string().default(''),
  description: z.string().optional(),
  scope: z.string().default('unknown'),
  source_path: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  checksum: z.string().optional(),
  fallback_profile: z.string().optional(),
  validation_errors: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const commandDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  source: z.string().default('unknown'),
  status: z.string().default('unknown'),
  enabled: z.boolean().default(false),
  disabled_reason: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  agent_id: z.string().optional(),
  user_invocable: z.boolean().optional(),
  agent_invocable: z.boolean().optional(),
  argument_hint: z.string().optional(),
  arguments: z.array(z.unknown()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const contextStateSchema = z.object({
  session_id: z.string(),
  scope: z.string(),
  window_tokens: z.number().int().nonnegative(),
  live_tokens: z.number().int().nonnegative(),
  used_tokens: z.number().int().nonnegative().nullish(),
  autocompact_enabled: z.boolean().default(true),
  autocompact_pct: z.number().nonnegative().nullish(),
  live_block_count: z.number().int().nonnegative(),
  tokens_by_kind: z.record(z.string(), z.number().int().nonnegative()).default({}),
  categories: z.record(z.string(), z.number().int().nonnegative()).default({}),
  segments: z.array(z.record(z.string(), z.unknown())).default([]),
  render_text: z.string().default(''),
  render_keys: z.record(z.string(), z.unknown()).default({}),
});

export const toolInvocationSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  run_id: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  name: z.string(),
  title: z.string().optional(),
  state: forwardCompatibleEnum([
    'pending',
    'running',
    'succeeded',
    'failed',
    'denied',
    'cancelled',
  ]),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  duration_ms: z
    .number()
    .nullish()
    .transform((value) => value ?? undefined),
  error: z.string().optional(),
});

export const taskSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  title: z.string(),
  state: runStateSchema,
  detail: z.string().optional(),
});

export const subagentSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  parent_run_id: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  child_session_id: z.string().optional(),
  agent_id: z.string().optional(),
  title: z.string(),
  state: runStateSchema,
  summary: z.string().optional(),
  task: z.string().optional(),
  result: z.string().optional(),
  duration_ms: z.number().optional(),
});

export const artifactSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  workspace_id: z.string().optional(),
  name: z.string(),
  media_type: z.string(),
  uri: z.string(),
  fetch_path: z.string().optional(),
  custody: z.string().optional(),
  sha256: z.string().optional(),
  size: z.number().optional(),
  created_at: z.string().optional(),
});

export const a2uiSurfaceSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  run_id: z.string().optional(),
  message_id: z.string().optional(),
  part_id: z.string().optional(),
  catalog_id: z.string(),
  protocol_version: z.literal(A2UI_VERSION),
  revision: z.number().int().nonnegative(),
  state: forwardCompatibleEnum([
    'creating',
    'ready',
    'updating',
    'pending_action',
    'failed',
    'cancelled',
    'disconnected',
    'deleted',
  ]),
  messages: z.array(z.unknown()),
  error: z.string().optional(),
});

export const infrastructureDependencySchema = z.object({
  id: z.string(),
  session_id: z.string(),
  category: z.string(),
  namespace: z.string(),
  title: z.string(),
  phase: forwardCompatibleEnum(['provision', 'launch', 'connect', 'retry']),
  state: forwardCompatibleEnum(['running', 'retrying', 'ready', 'failed']),
  attempt: z.number().int().positive(),
  max_attempts: z.number().int().positive(),
  reason: z.string().optional(),
  retry_in_ms: z.number().int().nonnegative().optional(),
  tool_count: z.number().int().nonnegative().optional(),
});

export const scopeSchema = z.object({
  connection_id: z.string(),
  workspace_id: z.string().optional(),
  session_id: z.string().optional(),
  run_id: z.string().optional(),
});

export const eventEnvelopeSchema = z.object({
  protocol_version: z.literal(PROTOCOL_VERSION),
  type: z.string(),
  occurred_at: z.string(),
  scope: scopeSchema,
  entity_id: z.string().optional(),
  entity_revision: z.number().int().nonnegative().optional(),
  payload: z.unknown(),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export function decodeEventEnvelope(data: unknown): EventEnvelope {
  return eventEnvelopeSchema.parse(data);
}
