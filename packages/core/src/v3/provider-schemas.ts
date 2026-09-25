import { z } from 'zod';
import { optionalWireString } from './schema-utils.js';

export const providerDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  auth_methods: z.array(z.string()).default([]),
  is_authenticated: z.boolean().default(false),
  default_model: optionalWireString(),
  api_base: optionalWireString(),
  description: optionalWireString(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const providerModelSchema = z.object({
  id: z.string(),
  availability: z.enum(['available', 'candidate']).optional(),
  name: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  label: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  description: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  context_window: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((value) => value ?? undefined),
  output_limit: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((value) => value ?? undefined),
  context_source: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
});

export const languageModelPresetSchema = z.object({
  id: z.string(),
  provider_id: z.string().optional().default(''),
  label: z.string(),
  provider: z.string(),
  litellm_prefix: z.string().optional().default(''),
  api_base: optionalWireString(),
  suggested_model: optionalWireString(),
  requires_api_key: z.boolean().default(false),
  auth_method: optionalWireString(),
  auth_label: optionalWireString(),
  is_authenticated: z.boolean().default(false),
  description: optionalWireString(),
  status: optionalWireString(),
  status_message: optionalWireString(),
  supports_live_catalog: z.boolean().default(false),
  supports_vision: z.boolean().default(false),
  configuration_fields: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: optionalWireString(),
        placeholder: optionalWireString(),
        required: z.boolean().default(false),
      }),
    )
    .default([]),
  supports_runtime_sizing: z.boolean().default(false),
  managed_service_id: optionalWireString(),
  supports_logout: z.boolean().default(false),
});

export const languageModelConfigurationSchema = z.object({
  configured: z.boolean(),
  provider_id: z.string().optional().default(''),
  provider: z.string(),
  api_base: z.string(),
  model: z.string(),
  temperature: z
    .number()
    .nullish()
    .transform((value) => value ?? undefined),
  max_tokens: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .transform((value) => (value === 0 ? undefined : value)),
  thinking_level: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  // "user" only when a person set thinking_level; otherwise it is a default.
  thinking_level_source: optionalWireString(),
  thinking_effective: optionalWireString(),
  state: optionalWireString(),
  status_message: optionalWireString(),
  error: optionalWireString(),
  provider_options: z.record(z.string(), z.string()).default({}),
  presets: z.array(languageModelPresetSchema).default([]),
});
