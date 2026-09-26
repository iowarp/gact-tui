/**
 * Generated from clio-schemas JSON Schema. Do not edit by hand.
 * Source: model_capability_tags.json
 */
import { z } from 'zod';
import type { ModelCapabilityTags } from './_models.js';

export const modelCapabilityTagsGeneratedSchema: z.ZodType<ModelCapabilityTags> = z
  .object({
    capabilities: z
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
            value: z.enum([
              'tool_calling',
              'parallel_tool_calls',
              'reasoning',
              'structured_output',
              'web_search',
              'code_execution',
              'computer_use',
              'prompt_caching',
            ]),
          })
          .strict(),
      )
      .optional(),
    domains: z
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
            value: z.enum([
              'language',
              'vision',
              'speech',
              'biology',
              'chemistry',
              'materials',
              'climate',
              'physics',
              'astronomy',
              'geoscience',
              'medical',
            ]),
          })
          .strict(),
      )
      .optional(),
    free: z
      .union([
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
            value: z.boolean(),
          })
          .strict(),
        z.null(),
      ])
      .default(null),
    input_modalities: z
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
            value: z.enum([
              'text',
              'image',
              'audio',
              'video',
              'pdf',
              'embeddings',
              'masks',
              'scores',
              'tensor',
            ]),
          })
          .strict(),
      )
      .optional(),
    model_key: z.string().min(1),
    model_type: z
      .union([
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
            value: z.enum([
              'chat',
              'embedding',
              'rerank',
              'audio_transcription',
              'audio_speech',
              'image_generation',
              'image_edit',
              'video_generation',
              'moderation',
              'ocr',
              'segmentation',
              'classification',
              'forecasting',
              'scientific_surrogate',
              'other',
            ]),
          })
          .strict(),
        z.null(),
      ])
      .default(null),
    output_modalities: z
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
            value: z.enum([
              'text',
              'image',
              'audio',
              'video',
              'pdf',
              'embeddings',
              'masks',
              'scores',
              'tensor',
            ]),
          })
          .strict(),
      )
      .optional(),
    role: z
      .union([
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
            value: z.enum(['general', 'surrogate']),
          })
          .strict(),
        z.null(),
      ])
      .default(null),
    router: z
      .union([
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
            value: z.boolean(),
          })
          .strict(),
        z.null(),
      ])
      .default(null),
    tasks: z
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
              .string()
              .regex(
                new RegExp(
                  '^(?:text-classification|token-classification|table-question-answering|question-answering|zero-shot-classification|translation|summarization|feature-extraction|text-generation|fill-mask|sentence-similarity|table-to-text|multiple-choice|text-ranking|text-retrieval|text-to-speech|text-to-audio|automatic-speech-recognition|audio-to-audio|audio-classification|voice-activity-detection|audio-text-to-text|image-text-to-text|image-text-to-image|image-text-to-video|visual-question-answering|document-question-answering|video-text-to-text|visual-document-retrieval|any-to-any|depth-estimation|image-classification|object-detection|image-segmentation|text-to-image|image-to-text|image-to-image|image-to-video|unconditional-image-generation|video-classification|text-to-video|zero-shot-image-classification|mask-generation|zero-shot-object-detection|text-to-3d|image-to-3d|image-feature-extraction|keypoint-detection|video-to-video|tabular-classification|tabular-regression|tabular-to-text|time-series-forecasting|reinforcement-learning|robotics|graph-ml|other|clio:[a-z0-9]+(?:-[a-z0-9]+)*)$',
                ),
              ),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
