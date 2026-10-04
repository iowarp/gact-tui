import { z } from 'zod';
import type { AttentionResult, AttentionSessionAvailability } from './attention-domain.js';

const attentionRunSchema = z.tuple([z.number(), z.number(), z.number()]);

const attentionSelectionSchema = z
  .object({
    part_id: z.string().optional(),
    field: z.string().optional(),
    start: z.number().optional(),
    end: z.number().optional(),
    text: z.string(),
    token_range: z.tuple([z.number(), z.number()]).optional(),
    steps: z.array(z.number()).optional(),
    step_count: z.number().optional(),
    output_tokens: z.number().optional(),
  })
  .passthrough();

const attentionSourceSchema = z
  .object({
    domain: z.string(),
    share: z.number(),
  })
  .passthrough();

const attentionFlagSchema = z
  .object({
    kind: z.string(),
    share: z.number(),
  })
  .passthrough();

const attentionBlockSchema = z
  .object({
    message_id: z.string(),
    part_id: z.string(),
    field: z.string(),
    kind: z.string(),
    section: z.number().optional(),
    share: z.number(),
    mean: z.number(),
    tokens: z.number().optional(),
    runs: z.array(attentionRunSchema).default([]),
  })
  .passthrough();

const attentionTokenSourceSchema = z
  .object({
    pos: z.number(),
    max: z.number(),
    mean: z.number(),
    section: z.number().optional(),
    text: z.string(),
  })
  .passthrough();

const attentionTokenSchema = z
  .object({
    step: z.number(),
    token_index: z.number(),
    text: z.string(),
    residual: z.number(),
    top: z.array(attentionTokenSourceSchema).default([]),
  })
  .passthrough();

const attentionAvailableSchema = z
  .object({
    schema: z.string().optional(),
    available: z.literal(true),
    message_id: z.string(),
    selection: attentionSelectionSchema,
    residual: z.number(),
    sources: z.array(attentionSourceSchema).default([]),
    flags: z.array(attentionFlagSchema).default([]),
    blocks: z.array(attentionBlockSchema).default([]),
    tokens: z.array(attentionTokenSchema).optional(),
  })
  .passthrough();

const attentionUnavailableSchema = z
  .object({
    available: z.literal(false),
    reason: z.string().optional(),
    message: z.string(),
    detail: z.string().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const attentionResultSchema: z.ZodType<AttentionResult> = z.union([
  attentionAvailableSchema,
  attentionUnavailableSchema,
]) as z.ZodType<AttentionResult>;

export const attentionSessionAvailabilitySchema: z.ZodType<AttentionSessionAvailability> = z
  .object({
    enabled: z.boolean(),
    reason: z.string().optional(),
    message: z.string().optional(),
    detail: z.string().optional(),
    messages: z.record(z.string(), z.boolean()),
  })
  .passthrough() as z.ZodType<AttentionSessionAvailability>;
