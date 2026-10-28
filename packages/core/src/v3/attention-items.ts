import { z } from 'zod';
import { attentionProfileGeneratedSchema } from '../generated/clio-schemas/attention-profile.schema.js';
import type { AttentionProfile } from './attention-domain.js';
import { attentionUnavailableSchema } from './attention-schemas.js';

/**
 * The SPOTTER per-item view (clio-agent `POST
 * /v1/sessions/{sid}/messages/{mid}/attention/items`): one attention vector
 * per answer item, laid over the whole rendered prompt line by line. A line's
 * value is the max over its tokens; each item's column is scaled to its own
 * max on a 10-level ramp, so a column shows where the item looked, not how
 * much attention it drew compared with another item.
 */
export interface AttentionItemSpan {
  text?: string;
  part_id?: string;
  field?: string;
  start?: number;
  end?: number;
  content_revision?: string;
}

export interface AttentionItemsRequest {
  items: AttentionItemSpan[];
  /** Cut each item at this delimiter (`;` reads `NIL 373; DIVERGES` as two items). */
  split?: string;
  profile?: AttentionProfile;
  lm_call_id?: string;
}

const attentionItemSchema = z
  .object({
    index: z.number(),
    text: z.string(),
    message_id: z.string(),
    part_id: z.string(),
    field: z.string(),
    start: z.number(),
    end: z.number(),
    decode_steps: z.array(z.number()),
    column_max: z.number(),
    score_max: z.number(),
  })
  .passthrough();

const attentionPromptLineSchema = z
  .object({
    index: z.number(),
    text: z.string(),
    token_lo: z.number(),
    token_hi: z.number(),
    section: z.number().nullable(),
    domain: z.string().nullable(),
    values: z.array(z.number()),
    levels: z.array(z.number()),
  })
  .passthrough();

export const attentionItemsAvailableSchema = z
  .object({
    schema: z.literal('clio.attention.items.v1'),
    available: z.literal(true),
    message_id: z.string(),
    request_id: z.string(),
    tokenizer: z.string(),
    profile: attentionProfileGeneratedSchema,
    profile_revision: z.string(),
    prompt_tokens: z.number(),
    top_pct: z.number().nullable(),
    ramp: z.string(),
    items: z.array(attentionItemSchema),
    lines: z.array(attentionPromptLineSchema),
  })
  .passthrough();

export type AttentionItemsAvailable = z.infer<typeof attentionItemsAvailableSchema>;
export type AttentionPromptLine = z.infer<typeof attentionPromptLineSchema>;
export type AttentionItemsResult =
  | AttentionItemsAvailable
  | z.infer<typeof attentionUnavailableSchema>;

export const attentionItemsResultSchema: z.ZodType<AttentionItemsResult> = z.union([
  attentionItemsAvailableSchema,
  attentionUnavailableSchema,
]) as z.ZodType<AttentionItemsResult>;

export const attentionItemsExportSchema = z.union([
  z
    .object({
      available: z.literal(true),
      filename: z.string(),
      columns: z.array(z.string()),
      rows: z.number(),
      csv: z.string(),
    })
    .passthrough(),
  attentionUnavailableSchema,
]);

export type AttentionItemsExport = z.infer<typeof attentionItemsExportSchema>;
