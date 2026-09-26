/**
 * Generated from clio-schemas JSON Schema. Do not edit by hand.
 * Source: accepted_parameter.json
 */
import { z } from 'zod';
import type { AcceptedParameter } from './_models.js';

export const acceptedParameterGeneratedSchema: z.ZodType<AcceptedParameter> = z
  .object({
    default: z.union([z.number(), z.string(), z.null()]),
    description: z.string(),
    evidence: z
      .array(
        z
          .object({
            detail: z.string(),
            observed_at: z.string(),
            source: z.enum([
              'user',
              'overlay',
              'server_report',
              'hf_repo',
              'models.dev',
              'litellm',
              'db',
              'openrouter',
              'dialect',
              'probe',
              'catalog',
            ]),
          })
          .strict(),
      )
      .nonempty(),
    group: z.enum(['sampling', 'length', 'advanced']),
    kind: z.enum(['number', 'integer', 'enum']),
    label: z.string().min(1),
    maximum: z.union([z.number(), z.null()]),
    minimum: z.union([z.number(), z.null()]),
    name: z.string().regex(new RegExp('^[a-z][a-z0-9_]*$')),
    options: z.array(z.string()).optional(),
    step: z.union([z.number().gt(0), z.null()]),
  })
  .strict();
