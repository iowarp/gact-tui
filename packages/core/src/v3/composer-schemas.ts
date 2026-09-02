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

/**
 * A steer the service accepted but has not delivered yet.
 *
 * Every field the service declares a default for is defaulted here too, per
 * SPEC §4.5.0: a reader treats a missing key exactly as it treats that field's
 * default, so a ledger written before a field existed still decodes. The three
 * lifecycle stamps are empty strings until their transition happens — the wire
 * carries `""`, never `null` and never an absent key, so they are strings with
 * an empty default rather than optionals.
 */
export const pendingSteerSchema = z.object({
  message_id: z.string(),
  session_id: z.string(),
  parts: z.array(composerMessagePartSchema).default([]),
  text: z.string().default(''),
  metadata: z.record(z.string(), z.unknown()).default({}),
  accepted_at: z.string(),
  behavior: messageBehaviorSchema,
  model: composerModelRefSchema,
  state: z.enum(['pending', 'claimed', 'consumed', 'cancelled']).default('pending'),
  claimed_at: z.string().default(''),
  consumed_at: z.string().default(''),
  cancelled_at: z.string().default(''),
});

/**
 * A durable future message. `revision` starts at 1 and `position` at 0 on the
 * wire, which is why one is positive and the other merely non-negative.
 */
export const queuedMessageSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  revision: z.number().int().positive().default(1),
  position: z.number().int().nonnegative().default(0),
  parts: z.array(composerMessagePartSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  client_message_id: z.string().default(''),
  idempotency_key: z.string().default(''),
  behavior: messageBehaviorSchema,
  model: composerModelRefSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const pendingSteerCancellationSchema = z.object({
  message_id: z.string(),
  session_id: z.string(),
});

export const queuedMessagePromotionSchema = z.object({
  queued_message_id: z.string(),
  acceptance: messageAcceptanceSchema,
  status_code: z.number().int().optional(),
});

export const workspaceResourceProcessingSchema = z.object({
  workspace_id: z.string(),
  resource_id: z.string(),
  resource_revision: z.number().int().positive(),
  source_sha256: z.string().default(''),
  processor: z.string().default(''),
  processor_url: z.string().default(''),
  job_id: z.string().default(''),
  query_tool: z.string().default('workspace_resource_inspect'),
  state: z
    .enum(['not_started', 'submitted', 'processing', 'complete', 'failed', 'cancelled'])
    .default('not_started'),
  progress: z.number().int().min(0).max(100).default(0),
  derivatives_available: z.boolean().default(false),
  failure: z.record(z.string(), z.unknown()).default({}),
  cancellation: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
  updated_at: z.string(),
});

/**
 * One immutable resource revision. A resource that is still `uploading` carries
 * every detection and completion field at its empty default rather than
 * omitting it, so those are defaulted strings, not optionals — a reader must
 * not take `detected_mime === ''` for "the type was never detected" without
 * also reading `state`.
 */
export const workspaceResourceSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  client_upload_id: z.string().default(''),
  revision: z.number().int().positive().default(1),
  name: z.string(),
  claimed_mime: z.string().default(''),
  detected_mime: z.string().default(''),
  detection_source: z.string().default(''),
  declared_size: z.number().int().nonnegative(),
  received_size: z.number().int().nonnegative().default(0),
  sha256: z.string().default(''),
  state: z.enum(['uploading', 'ready', 'quarantined', 'failed']).default('uploading'),
  failure: z.string().default(''),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().default(''),
  mime_mismatch: z.boolean().default(false),
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

export const workspaceResourceStructureNodeSchema = z
  .object({
    collection: z.string(),
    index: z.number().int().nonnegative(),
    node: z.unknown(),
  })
  .transform((value) => ({
    collection: value.collection,
    index: value.index,
    node: value.node,
  }));

/** Search hits. `line` is the service's own 1-based line number. */
export const workspaceResourceSearchResultSchema = z.object({
  resource_id: z.string(),
  query: z.string(),
  matches: z.array(z.object({ line: z.number().int().positive(), text: z.string() })).default([]),
  truncated: z.boolean().default(false),
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
    representation: z.enum([
      'native',
      'bounded_tools',
      'structured_document',
      'sandbox',
      'retrieval',
      'metadata_only',
    ]),
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
          context_window: z
            .number()
            .nullish()
            .transform((value) => value ?? undefined),
          loaded_context_window: z
            .number()
            .nullish()
            .transform((value) => value ?? undefined),
          output_limit: z
            .number()
            .nullish()
            .transform((value) => value ?? undefined),
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
