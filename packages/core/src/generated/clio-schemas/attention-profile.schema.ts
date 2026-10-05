/**
 * Generated from clio-schemas JSON Schema. Do not edit by hand.
 * Source: attention_profile.json
 */
import { z } from 'zod';
import type { AttentionProfile } from './_models.js';

export const attentionProfileGeneratedSchema: z.ZodType<AttentionProfile> = z
  .object({
    block_reduction: z.enum(['sum', 'mean', 'max']).default('sum'),
    content_steps: z.literal('all_selected_captured_steps').default('all_selected_captured_steps'),
    decay_base: z.number().gt(0).lte(1).default(0.5),
    direction: z.enum(['forward', 'reverse']).default('forward'),
    display_scaling: z.enum(['max', 'none']).default('max'),
    metric: z.enum(['mean', 'max']).default('mean'),
    name: z.string().min(1).max(100).default('uniform-mean'),
    schema_version: z.literal(1).default(1),
    version: z.literal(1).default(1),
    weight_normalization: z.enum(['sum', 'none']).default('sum'),
    weighting: z.enum(['uniform', 'exponential']).default('uniform'),
  })
  .strict();
