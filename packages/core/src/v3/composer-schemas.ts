import { z } from 'zod';

export const composerModelRefSchema = z.object({
  provider_id: z.string(),
  model_id: z.string(),
  variant: z.string().optional(),
});

export const messageBehaviorSchema = z.object({
  reasoning_effort: z.enum(['off', 'low', 'medium', 'high', 'xhigh']),
  execution_mode: z.enum(['execute', 'plan', 'deep_research']),
  confirmation_policy: z.enum(['ask', 'auto-edits', 'bypass', 'ai-review', 'spotter-ai']),
});

export const composerMessagePartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('resource_ref'),
    resource_id: z.string(),
    resource_revision: z.string(),
    name: z.string(),
    delivery_preference: z.string().optional(),
  }),
]);

export const messageAcceptanceSchema = z.object({
  message_id: z.string(),
  accepted_at: z.string(),
  delivery: z.enum(['start', 'steer', 'auto']),
  state: z.enum(['started', 'pending_steer', 'queued']),
  effective_model: composerModelRefSchema,
  behavior: messageBehaviorSchema,
  idempotent_replay: z.boolean(),
});

export const pendingSteerSchema = z.object({
  message_id: z.string(),
  session_id: z.string(),
  parts: z.array(composerMessagePartSchema),
  text: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  accepted_at: z.string(),
  behavior: messageBehaviorSchema,
  model: composerModelRefSchema,
  state: z.enum(['pending', 'claimed', 'consumed', 'cancelled']),
  claimed_at: z.string(),
  consumed_at: z.string(),
  cancelled_at: z.string(),
});

export const queuedMessageSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  revision: z.number().int().positive(),
  position: z.number().int().nonnegative(),
  parts: z.array(composerMessagePartSchema),
  metadata: z.record(z.string(), z.unknown()),
  client_message_id: z.string(),
  idempotency_key: z.string(),
  behavior: messageBehaviorSchema,
  model: composerModelRefSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const workspaceResourceProcessingSchema = z.object({
  workspace_id: z.string(),
  resource_id: z.string(),
  resource_revision: z.number().int().positive(),
  source_sha256: z.string(),
  processor: z.string(),
  processor_url: z.string(),
  job_id: z.string(),
  query_tool: z.string().default('workspace_resource_inspect'),
  state: z.enum(['not_started', 'submitted', 'processing', 'complete', 'failed', 'cancelled']),
  progress: z.number().int().min(0).max(100),
  failure: z.record(z.string(), z.unknown()),
  cancellation: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
  updated_at: z.string(),
});

export const workspaceResourceSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  client_upload_id: z.string().default(''),
  revision: z.number().int().positive(),
  name: z.string(),
  claimed_mime: z.string(),
  detected_mime: z.string(),
  detection_source: z.string(),
  declared_size: z.number().int().nonnegative(),
  received_size: z.number().int().nonnegative(),
  sha256: z.string(),
  state: z.enum(['uploading', 'ready', 'quarantined', 'failed']),
  failure: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string(),
  mime_mismatch: z.boolean(),
  processing: workspaceResourceProcessingSchema.optional(),
  idempotent_replay: z.boolean().optional(),
  upload_url: z.string().optional(),
});

export const workspaceResourceDerivativeSchema = z
  .object({
    id: z.string(),
    name: z.string().default(''),
    media_type: z.string().default('application/octet-stream'),
    kind: z.string().default('derived'),
    size: z.number().int().nonnegative().optional(),
    content_url: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const workspaceResourceDerivativesSchema = z.object({
  resource_id: z.string(),
  revision: z.number().int().positive(),
  derivatives: z.array(workspaceResourceDerivativeSchema),
  processor: workspaceResourceProcessingSchema,
});

export const workspaceResourceStructureSchema = z.object({
  resource_id: z.string(),
  revision: z.number().int().positive(),
  collections: z.record(z.string(), z.number().int().nonnegative()),
});

export const workspaceResourceSearchResultSchema = z.object({
  resource_id: z.string(),
  query: z.string(),
  matches: z.array(z.object({ line: z.number().int().positive(), text: z.string() })),
  truncated: z.boolean(),
});

export const resourceDeliveryRecordSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string(),
    resource_id: z.string(),
    resource_revision: z.number().int().positive(),
    resource_sha256: z.string(),
    message_id: z.string(),
    provider_id: z.string(),
    model_id: z.string(),
    representation: z.string(),
    evidence_source: z.string(),
    evidence_generated_at: z.string(),
    reason: z.string(),
    delivered_at: z.string(),
  })
  .passthrough();

export const providerCatalogSchema = z.object({
  authoritative: z.string(),
  providers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      endpoint: z.string(),
      configuration_url: z.string(),
      connectivity: z.string(),
      auth: z.string(),
      health: z.string(),
      freshness: z.object({ generated_at: z.string(), source: z.string() }),
      failure: z.string(),
      models: z.array(
        z.object({
          provider_id: z.string(),
          provider_kind: z.string(),
          endpoint: z.string(),
          deployment: z.string(),
          model_id: z.string(),
          revision: z.string(),
          modalities: z.array(z.string()),
          reasoning: z.object({ supported: z.boolean(), parameter: z.string() }),
          native_tool_calling: z.boolean(),
          context_window: z.number().optional(),
          loaded_context_window: z.number().optional(),
          output_limit: z.number().optional(),
          availability: z.string(),
          evidence: z.object({
            source: z.string(),
            generated_at: z.string(),
            live: z.boolean(),
            context_source: z.string(),
          }),
          failure: z.string(),
        }),
      ),
    }),
  ),
});
