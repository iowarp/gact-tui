import { z } from 'zod';

const healthSchema = z.object({ status: z.string().optional() }).passthrough();
// Provider summaries intentionally keep their provider-native identity fields.
// Native rows may expose `id`, while Flowcept uses `campaign_id` and
// `workflow_id`; requiring one invented common identifier would reject valid
// provenance before the normalized nodes and edges can be rendered.
const entitySchema = z.record(z.string(), z.unknown());
const nullableFiniteNumber = z.number().finite().nullable();

export const provenanceProviderSchema = z.object({
  name: z.string(),
  configured: z.boolean(),
  queryable: z.boolean(),
  durable: z.boolean(),
  status: z.string(),
  source: z.string(),
  health: healthSchema.default({}),
});

export const provenanceProvidersSchema = z.object({
  schema_version: z.string(),
  default_provider: z.string(),
  providers: z.array(provenanceProviderSchema),
  artifact: z
    .object({
      provider: z.string(),
      queryable: z.boolean(),
      durable: z.boolean(),
      status: z.string(),
      health: healthSchema.default({}),
    })
    .optional(),
});

const artifactRefSchema = z.object({ artifact_id: z.string(), sha256: z.string() });
const executionSpanSchema = z.object({
  id: z.string(),
  parent_id: z.string(),
  kind: z.string(),
  session_id: z.string(),
  workflow_id: z.string(),
  campaign_id: z.string(),
  agent_id: z.string(),
  source_agent_id: z.string(),
  label: z.string(),
  event_type: z.string(),
  status: z.string(),
  start_time: nullableFiniteNumber,
  end_time: nullableFiniteNumber,
  duration_ms: nullableFiniteNumber,
  host: z.string(),
  artifact_refs: z.array(artifactRefSchema),
  attributes: z.record(z.string(), z.unknown()),
  source_event_ids: z.array(z.string()),
});
const executionNodeSchema = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string(),
  status: z.string(),
  session_id: z.string(),
  agent_id: z.string(),
  start_time: nullableFiniteNumber,
  end_time: nullableFiniteNumber,
  attributes: z.record(z.string(), z.unknown()),
});
const executionEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: z.string(),
});

export const executionProvenanceSchema = z.object({
  schema_version: z.string(),
  provider: z.string(),
  session_id: z.string(),
  complete: z.boolean(),
  truncated: z.boolean(),
  provider_health: healthSchema.default({}),
  campaigns: z.array(entitySchema),
  workflows: z.array(entitySchema),
  agents: z.array(entitySchema),
  spans: z.array(executionSpanSchema),
  nodes: z.array(executionNodeSchema),
  edges: z.array(executionEdgeSchema),
});
