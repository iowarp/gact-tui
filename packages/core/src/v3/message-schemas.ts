import { z } from 'zod';
import { forwardCompatibleEnum } from './schema-utils.js';

const actionCardActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  enabled: z.boolean().default(true),
  behavior: z
    .object({
      kind: z.string(),
      handle_id: z.string().optional(),
      reason: z.string().optional(),
    })
    .passthrough(),
});

const messageBlockContextSchema = z.object({
  agent_id: z.string().optional(),
  sequence: z.number().int().positive().optional(),
  stream_source: z.string().optional(),
  channel: z.string().optional(),
});

const knownMessageBlockSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('text'),
    text: z.string(),
    streaming: z.boolean().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('reasoning'),
    text: z.string(),
    streaming: z.boolean().optional(),
    source: z.string().optional(),
    provider_source: z.string().optional(),
    default_collapsed: z.boolean().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('tool'),
    tool_id: z.string(),
    thought: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('plan'),
    title: z.string(),
    detail: z.string().optional(),
  }),
  z.object({ id: z.string(), type: z.literal('task'), task_id: z.string() }),
  z.object({ id: z.string(), type: z.literal('subagent'), subagent_id: z.string() }),
  z.object({ id: z.string(), type: z.literal('artifact'), artifact_id: z.string() }),
  z.object({
    id: z.string(),
    type: z.literal('action_card'),
    title: z.string(),
    detail: z.string().optional(),
    source: z.string().optional(),
    severity: z.string().optional(),
    status: z.string().optional(),
    actions: z.array(actionCardActionSchema),
  }),
  z.object({ id: z.string(), type: z.literal('a2ui'), surface_id: z.string() }),
  z.object({ id: z.string(), type: z.literal('citation'), label: z.string(), uri: z.string() }),
  z.object({
    id: z.string(),
    type: z.literal('diff'),
    path: z.string(),
    unified_diff: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('routing'),
    label: z.string(),
    detail: z.string().optional(),
  }),
]);

const unknownMessageBlockSchema = z
  .object({ id: z.string(), type: z.string() })
  .passthrough()
  .transform((value) => ({
    id: value.id,
    type: 'unknown' as const,
    original_type: value.type,
    raw: value,
  }));

export const messageBlockSchema = z
  .union([knownMessageBlockSchema, unknownMessageBlockSchema])
  .and(messageBlockContextSchema);

export const messageUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cache_read: z.number().int().nonnegative(),
  cache_write: z.number().int().nonnegative(),
});

export const messageCompletionSchema = z.object({
  message_id: z.string(),
  completed_at: z.string().optional(),
  stop_reason: z.string().optional(),
  tokens: messageUsageSchema.optional(),
  cost_usd: z
    .number()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined),
  error_info: z.record(z.string(), z.unknown()).optional(),
});

export const messageSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  run_id: z.string().optional(),
  role: forwardCompatibleEnum(['user', 'assistant', 'system']),
  created_at: z.string(),
  completed_at: z.string().optional(),
  blocks: z.array(messageBlockSchema),
  usage: messageUsageSchema.optional(),
  cost_usd: z.number().nonnegative().optional(),
  stop_reason: z.string().optional(),
  error_info: z.record(z.string(), z.unknown()).optional(),
});
