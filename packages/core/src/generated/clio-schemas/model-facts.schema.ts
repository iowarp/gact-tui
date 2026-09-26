/**
 * Generated from clio-schemas JSON Schema. Do not edit by hand.
 * Source: model_facts.json
 */
import { z } from 'zod';
import type { ModelFacts } from './_models.js';

export const modelFactsGeneratedSchema: z.ZodType<ModelFacts> = z
  .object({
    description: z.union([
      z
        .object({
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
          value: z
            .object({
              links: z.array(z.object({ text: z.string(), url: z.string() }).strict()).optional(),
              plain: z.string(),
              text: z.string().min(1),
            })
            .strict(),
        })
        .strict(),
      z.null(),
    ]),
    model_key: z.string().min(1),
    parameters: z.union([
      z
        .object({
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
          value: z
            .object({
              active: z.union([z.number().int().gt(0), z.null()]),
              experts_active: z.union([z.number().int().gt(0), z.null()]),
              experts_total: z.union([z.number().int().gt(0), z.null()]),
              precision: z.enum(['exact', 'rounded']),
              total: z.union([z.number().int().gt(0), z.null()]),
            })
            .strict(),
        })
        .strict(),
      z.null(),
    ]),
    pricing: z.union([
      z
        .object({
          alternatives: z
            .array(
              z
                .object({
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
                  value: z
                    .object({
                      input: z
                        .object({
                          kind: z.enum(['usd', 'variable', 'subscription']),
                          per_1m: z.union([z.number(), z.null()]),
                        })
                        .strict(),
                      output: z
                        .object({
                          kind: z.enum(['usd', 'variable', 'subscription']),
                          per_1m: z.union([z.number(), z.null()]),
                        })
                        .strict(),
                      unit: z.literal('usd_per_1m_tokens'),
                    })
                    .strict(),
                })
                .strict(),
            )
            .optional(),
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
          value: z
            .object({
              input: z
                .object({
                  kind: z.enum(['usd', 'variable', 'subscription']),
                  per_1m: z.union([z.number(), z.null()]),
                })
                .strict(),
              output: z
                .object({
                  kind: z.enum(['usd', 'variable', 'subscription']),
                  per_1m: z.union([z.number(), z.null()]),
                })
                .strict(),
              unit: z.literal('usd_per_1m_tokens'),
            })
            .strict(),
        })
        .strict(),
      z.null(),
    ]),
    recent: z.union([
      z
        .object({
          as_of: z.string().regex(new RegExp('^\\d{4}-\\d{2}-\\d{2}$')),
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
          value: z.boolean(),
          window_months: z.number().int().gt(0),
        })
        .strict(),
      z.null(),
    ]),
    released_at: z.union([
      z
        .object({
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
          value: z
            .object({
              date: z.string().regex(new RegExp('^\\d{4}(-\\d{2}(-\\d{2})?)?$')),
              precision: z.enum(['day', 'month', 'year']),
            })
            .strict(),
        })
        .strict(),
      z.null(),
    ]),
  })
  .strict();
