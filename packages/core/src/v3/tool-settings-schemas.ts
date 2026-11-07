import { z } from 'zod';

/** What a call of a tool does in one approval mode (``GET /v1/settings/tools``). */
export const toolOutcomeSchema = z.enum([
  'runs',
  'asks',
  'blocked',
  'reviewed',
  'covered',
  'unavailable',
]);
export type ToolOutcome = z.infer<typeof toolOutcomeSchema>;

export const toolPermissionSchema = z.enum(['allow', 'ask', 'deny']);
export type ToolPermission = z.infer<typeof toolPermissionSchema>;
export const toolCallersSchema = z.enum(['direct', 'code', 'both']);
export type ToolCallers = z.infer<typeof toolCallersSchema>;

/** A person's saved rule that names one tool. */
export const toolRuleSchema = z.object({
  scope: z.string(),
  scope_id: z.string().default(''),
  where: z.enum(['everywhere', 'session', 'workspace']).catch('workspace'),
  action: z.string(),
  path_pattern: z.string().default(''),
});
export type ToolRule = z.infer<typeof toolRuleSchema>;

export const toolSettingSchema = z.object({
  name: z.string(),
  kind: z.string(),
  server: z.string().default(''),
  description: z.string().default(''),
  read_only: z.boolean(),
  destructive: z.boolean().default(false),
  flags_known: z.boolean().default(true),
  group: z.enum(['read', 'write']),
  plugin_permission: z.union([toolPermissionSchema, z.literal('')]),
  plugin_permission_source: z.enum(['plugin', 'annotations']),
  configured_permission: z.union([toolPermissionSchema, z.literal('')]).default(''),
  rules: z.array(toolRuleSchema).default([]),
  permission: z.union([toolPermissionSchema, z.literal('')]),
  plugin_callers: toolCallersSchema,
  plugin_callers_known: z.boolean().default(true),
  configured_callers: z.union([toolCallersSchema, z.literal('')]).default(''),
  callers: toolCallersSchema,
  outcomes: z.record(
    z.string(),
    z.object({ direct: toolOutcomeSchema, script: toolOutcomeSchema }),
  ),
});
export type ToolSetting = z.infer<typeof toolSettingSchema>;

export const toolSettingsSchema = z.object({
  plugin: z.string(),
  approval_modes: z.array(z.string()),
  covering_modes: z.array(z.string()).default([]),
  tools: z.array(toolSettingSchema),
  servers_not_loaded: z.array(z.string()).default([]),
});
export type ToolSettings = z.infer<typeof toolSettingsSchema>;

/** Save the person's choice for some tools; ``null`` returns to the plugin's default. */
export interface ToolSettingsUpdate {
  tools: string[];
  permission?: ToolPermission | null;
  callers?: ToolCallers | null;
}
