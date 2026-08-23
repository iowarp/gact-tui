import { z } from 'zod';
import {
  a2uiSurfaceSchema,
  agentBlueprintSchema,
  agentBlueprintSourceSchema,
  agentDefinitionSchema,
  artifactSchema,
  commandDefinitionSchema,
  mcpServerDefinitionSchema,
  messageSchema,
  operationalRunSchema,
  permissionLedgerItemSchema,
  promptDefinitionSchema,
  providerDefinitionSchema,
  providerModelSchema,
  sessionSchema,
  subagentSchema,
  taskSchema,
  toolCatalogItemSchema,
  toolInvocationSchema,
  userQuestionSchema,
  workspaceFileEntrySchema,
  workspaceSchema,
} from './schemas.js';

export const workspaceListSchema = z.object({ workspaces: z.array(workspaceSchema) });
export const sessionListSchema = z.object({ sessions: z.array(sessionSchema) });
export const transcriptSchema = z.object({
  messages: z.array(messageSchema),
  tools: z.array(toolInvocationSchema).default([]),
  tasks: z.array(taskSchema).default([]),
  subagents: z.array(subagentSchema).default([]),
  artifacts: z.array(artifactSchema).default([]),
  surfaces: z.array(a2uiSurfaceSchema).default([]),
});
export const providerListSchema = z.object({ providers: z.array(providerDefinitionSchema) });
export const providerModelCatalogSchema = z.object({
  models: z.array(providerModelSchema),
  source: z.string().optional(),
  default_model: z.string().optional(),
  generated_at: z.string().optional(),
  error: z.string().optional(),
});
export const providerModelRefreshResultSchema = z.object({
  provider: z.string(),
  discovered: z.array(providerModelSchema).default([]),
  source: z.string(),
  default_model: z.string().default(''),
  default_model_reason: z.string().optional(),
  generated_at: z.string(),
  added: z.array(z.string()).default([]),
  removed: z.array(z.string()).default([]),
  unchanged: z.array(z.string()).default([]),
  failed_reason: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  rejected: z.array(z.record(z.string(), z.string())).default([]),
});
export const providerModelRefreshResponseSchema = z.object({
  results: z.array(providerModelRefreshResultSchema).default([]),
});
export const providerHandshakeSchema = z.object({
  models: z.array(providerModelSchema).default([]),
  source: z.string(),
  error: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  connectivity: z.enum(['ok', 'unreachable', 'timeout', 'skipped']),
  auth: z.enum(['ok', 'missing', 'rejected', 'not_required', 'deferred']),
  latency_ms: z
    .number()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined),
  generated_at: z.string(),
});
export const artifactVersionSchema = z.object({
  artifact_id: z.string(),
  workspace_id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  kind: z.string(),
  custody: z.string(),
  mechanism: z.string(),
  evidence_class: z.string(),
  sha256: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  size_bytes: z
    .number()
    .int()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined),
  authority: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  path: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  created_at: z.string(),
  annotation: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  producer: z.record(z.string(), z.unknown()).default({}),
  prior_version: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((value) => value ?? undefined),
  prior_sha256: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  kind_warning: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  custody_gap: z
    .boolean()
    .nullish()
    .transform((value) => value ?? undefined),
  uri: z.string(),
  fetch_url: z.string(),
});
export const artifactRecordSchema = z.object({
  workspace_id: z.string(),
  name: z.string(),
  kind: z.string(),
  latest_version: z.number().int().nonnegative(),
  head_artifact_id: z.string(),
  aliases: z.record(z.string(), z.number().int().positive()).default({}),
  versions: z.array(artifactVersionSchema).default([]),
});
export const artifactDetailSchema = z.object({
  artifact: artifactRecordSchema,
  resolved: artifactVersionSchema,
});
export const artifactLineageSchema = z.object({
  root: z.string(),
  direction: z.enum(['upstream', 'downstream', 'both']),
  depth: z.number().int().nonnegative(),
  nodes: z.array(
    z.object({ id: z.string(), type: z.enum(['artifact', 'activity', 'gap']) }).passthrough(),
  ),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      type: z.enum(['used', 'generated', 'revision_of']),
      evidence: z.string(),
    }),
  ),
  truncated: z
    .object({
      reason: z.string(),
      nodes: z.number().int().nonnegative().optional(),
      at_depth: z.number().int().nonnegative().optional(),
    })
    .nullish()
    .transform((value) => value ?? undefined),
});
export const permissionListSchema = z.object({
  permissions: z.array(permissionLedgerItemSchema).default([]),
});
export const questionListSchema = z.object({ questions: z.array(userQuestionSchema).default([]) });
export const operationalRunListSchema = z.object({
  runs: z.array(operationalRunSchema).default([]),
});
export const workspaceFileListSchema = z.object({
  entries: z.array(workspaceFileEntrySchema).default([]),
});
export const agentBlueprintListSchema = z.object({
  agent_blueprints: z.array(agentBlueprintSchema).default([]),
});
export const agentBlueprintSourceListSchema = z.object({
  sources: z.array(agentBlueprintSourceSchema).default([]),
});
export const toolCatalogSchema = z.object({ tools: z.array(toolCatalogItemSchema).default([]) });
export const mcpServerListSchema = z.object({
  servers: z.array(mcpServerDefinitionSchema).default([]),
});
export const agentListSchema = z.object({ agents: z.array(agentDefinitionSchema).default([]) });
export const promptListSchema = z.object({ prompts: z.array(promptDefinitionSchema).default([]) });
export const commandListSchema = z.object({
  commands: z.array(commandDefinitionSchema).default([]),
});
