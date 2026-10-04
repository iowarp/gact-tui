import { z } from 'zod';
import { attentionProfileGeneratedSchema } from '../generated/clio-schemas/attention-profile.schema.js';
import { contentSelectionGeneratedSchema } from '../generated/clio-schemas/content-selection.schema.js';
import { attentionAvailableSchema, attentionUnavailableSchema } from './attention-schemas.js';

export { contentSelectionGeneratedSchema as contentSelectionSchema };
export { attentionProfileGeneratedSchema as attentionProfileSchema };

export type AttentionLookupDirection = 'generated_to_source' | 'source_to_generation';
const identity = {
  lm_call_id: z.string(),
  response_id: z.string(),
  request_id: z.string(),
  capture_sha256: z.string(),
  profile_revision: z.string(),
};
const sourceView = z.object({
  ...identity,
  kind: z.literal('source'),
  available: z.literal(true),
  turn_id: z.string(),
  profile: attentionProfileGeneratedSchema,
  sources: z.array(contentSelectionGeneratedSchema),
  generated_references: z.array(contentSelectionGeneratedSchema),
  heat: attentionAvailableSchema.optional(),
  score: z.number(),
  mass: z.number(),
  residual: z.number(),
  step_count: z.number(),
  tokens: z.array(
    z.object({
      step: z.number(),
      start: z.number(),
      end: z.number(),
      text: z.string(),
      score: z.number(),
      mass: z.number(),
      intensity: z.number(),
      retained_tokens: z.number(),
    }),
  ),
  omitted_tokens: z.number(),
});
const generatedView = attentionAvailableSchema.extend({
  ...identity,
  kind: z.literal('generated'),
  selected_steps: z.array(z.number()),
});
export const attentionLookupSchema = z.object({
  schema: z.literal('clio.attention.lookup.v1'),
  direction: z.enum(['generated_to_source', 'source_to_generation']),
  profile: attentionProfileGeneratedSchema,
  profile_revision: z.string(),
  selection_count: z.number(),
  views: z.array(z.discriminatedUnion('kind', [sourceView, generatedView])),
  unavailable: z.array(attentionUnavailableSchema),
  next_cursor: z.number().nullable(),
});
export type AttentionLookup = z.infer<typeof attentionLookupSchema>;
const unavailable = attentionUnavailableSchema.strip();
export const attentionLookupResultSchema = z.union([attentionLookupSchema, unavailable]);
export type AttentionLookupResult = z.infer<typeof attentionLookupResultSchema>;
