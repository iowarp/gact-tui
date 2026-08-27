import { z } from 'zod';
import {
  messageBlockGeneratedSchema,
  messageBlockTypes,
} from '../generated/clio-schemas/message-block.schema.js';
import type { MessageBlock } from './domain.js';
import { forwardCompatibleEnum } from './schema-utils.js';

function omitGeneratedNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitGeneratedNulls);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== null)
      .map(([key, child]) => [key, omitGeneratedNulls(child)]),
  );
}

const knownMessageBlockSchema = messageBlockGeneratedSchema.transform(
  (value) => omitGeneratedNulls(value) as MessageBlock,
);
const knownMessageBlockTypes = new Set<string>(messageBlockTypes);

const unknownMessageBlockSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    agent_id: z.string().optional(),
    sequence: z.number().int().positive().optional(),
    stream_source: z.string().optional(),
    channel: z.string().optional(),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (knownMessageBlockTypes.has(value.type)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Known message block ${value.type} does not satisfy the shared schema`,
        path: ['type'],
      });
    }
  })
  .transform((value) => ({
    id: value.id,
    type: 'unknown' as const,
    original_type: value.type,
    raw: value,
    ...(value.agent_id ? { agent_id: value.agent_id } : {}),
    ...(value.channel ? { channel: value.channel } : {}),
    ...(value.sequence ? { sequence: value.sequence } : {}),
    ...(value.stream_source ? { stream_source: value.stream_source } : {}),
  }));

export const messageBlockSchema = z.union([knownMessageBlockSchema, unknownMessageBlockSchema]);

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
