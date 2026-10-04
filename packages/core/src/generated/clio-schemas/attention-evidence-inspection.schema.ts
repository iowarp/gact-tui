/**
 * Generated from clio-schemas JSON Schema. Do not edit by hand.
 * Source: attention_evidence_inspection.json
 */
import { z } from 'zod';
import type { AttentionEvidenceInspection } from './_models.js';

export const attentionEvidenceInspectionGeneratedSchema: z.ZodType<AttentionEvidenceInspection> = z
  .object({
    capture_sha256: z.string().min(1).max(256),
    direction: z.enum(['generated_to_source', 'source_to_generation']),
    lm_call_id: z.string().min(1).max(256),
    profile: z
      .object({
        block_reduction: z.enum(['sum', 'mean', 'max']).default('sum'),
        content_steps: z
          .literal('all_selected_captured_steps')
          .default('all_selected_captured_steps'),
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
      .strict(),
    profile_revision: z.string().min(1).max(256),
    schema_version: z.literal(1),
    selections: z
      .array(
        z
          .object({
            artifact_ref: z.union([z.string(), z.null()]).default(null),
            call_id: z.union([z.string(), z.null()]).default(null),
            content_revision: z.string().min(1),
            field: z.enum(['text', 'thought', 'input', 'result', 'content']).default('text'),
            message_id: z.string().min(1),
            part_id: z.string().min(1),
            schema_version: z.literal(1).default(1),
            selection: z.discriminatedUnion('kind', [
              z
                .object({
                  end: z.number().int().gt(0),
                  kind: z.literal('text').default('text'),
                  start: z.number().int().gte(0),
                })
                .strict(),
              z.object({ kind: z.literal('whole').default('whole') }).strict(),
              z
                .object({
                  height: z.number().gt(0).lte(1),
                  kind: z.literal('image_region').default('image_region'),
                  width: z.number().gt(0).lte(1),
                  x: z.number().gte(0).lte(1),
                  y: z.number().gte(0).lte(1),
                })
                .strict(),
              z
                .object({
                  component_id: z.string().min(1),
                  keys: z.array(z.string()).nonempty(),
                  kind: z.literal('structured').default('structured'),
                  source_ref: z.string().min(1),
                  surface_id: z.string().min(1),
                })
                .strict(),
            ]),
            session_id: z.string().min(1),
            surface: z
              .union([
                z
                  .object({
                    component_id: z.string().min(1).max(256),
                    revision: z.number().int().gte(0),
                    sha256: z.string().regex(new RegExp('^[a-f0-9]{64}$')),
                    surface_id: z.string().min(1).max(256),
                  })
                  .strict(),
                z.null(),
              ])
              .default(null),
          })
          .strict(),
      )
      .nonempty()
      .max(32),
  })
  .strict();
