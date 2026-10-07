import { z } from 'zod';

const settingValue = z.union([z.boolean(), z.number().finite()]);

/** Curated preferences and provenance supplied by the connected service. */
export const runtimeSettingsSchema = z.object({
  revision: z.string(),
  config_path: z.string(),
  settings: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      description: z.string(),
      group: z.string(),
      value: settingValue,
      default_value: settingValue,
      kind: z.enum(['boolean', 'number', 'integer']),
      minimum: z.number().nullable(),
      maximum: z.number().nullable(),
      unit: z.string().nullable(),
      effect: z.string(),
      source: z.enum(['workspace', 'user', 'environment', 'default']),
      has_user_value: z.boolean(),
      editable: z.boolean(),
      reason: z.string().nullable(),
    }),
  ),
});

export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;
export type RuntimeSetting = RuntimeSettings['settings'][number];
export interface UpdateRuntimeSettings {
  revision: string;
  changes: Record<string, boolean | number | null>;
}
