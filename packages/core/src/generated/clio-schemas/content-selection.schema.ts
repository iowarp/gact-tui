/**
 * Generated from clio-schemas JSON Schema. Do not edit by hand.
 * Source: content_selection.json
 */
import { z } from 'zod';
import type { ContentSelection } from './_models.js';

export const contentSelectionGeneratedSchema: z.ZodType<ContentSelection> = z
  .object({
    artifact_ref: z.union([z.string(), z.null()]).default(null),
    call_id: z.union([z.string(), z.null()]).default(null),
    content_revision: z.string().min(1),
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
  })
  .strict();
