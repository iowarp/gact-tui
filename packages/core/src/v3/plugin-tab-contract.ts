import { z } from 'zod';
import type { A2UISurface } from './domain.js';
import { a2uiSurfaceSchema } from './schemas.js';
import { forwardCompatibleEnum } from './schema-utils.js';

/**
 * Host semantics HS2 and HS3 (clio-agent `docs/design/host-semantics-contract.md`):
 * the reply to an action on any surface, and a plugin's workbench tabs, whose
 * surfaces come from its own MCP server and live only while the tab is open.
 */

/** HS2: what the owning server did with an action. Older replies carry only `status`. */
export const a2uiActionReplySchema = z
  .object({
    status: z.string(),
    destination: z.string().optional(),
    state: z.string().optional(),
    delivery: z.string().optional(),
    action_id: z.string().optional(),
    tool: z.string().optional(),
    outcome: forwardCompatibleEnum([
      'applied',
      'no_update',
      'task_pending',
      'tool_error',
    ]).optional(),
    surface_ids: z.array(z.string()).optional(),
    error_text: z.string().optional(),
  })
  .passthrough();

export type A2uiActionReply = z.infer<typeof a2uiActionReplySchema>;

export const pluginTabSchema = z
  .object({
    /** `<plugin>/<tab>`. */
    id: z.string(),
    plugin: z.string(),
    /** The plugin's display name, when it declares one. */
    plugin_title: z.string().default(''),
    title: z.string(),
    /** A Lucide icon name; an unknown name shows a generic icon. */
    icon: z.string().default(''),
    server: z.string().default(''),
    resource: z.string().default(''),
    available: z.boolean().default(true),
    reason: z.string().default(''),
  })
  .passthrough();

export type PluginTab = z.infer<typeof pluginTabSchema>;

export const pluginTabListSchema = z
  .object({ tabs: z.array(pluginTabSchema) })
  .passthrough()
  .transform((value) => value.tabs);

export interface PluginTabOpened {
  tab: PluginTab;
  surfaces: A2UISurface[];
  revision: number;
}

export const pluginTabOpenedSchema: z.ZodType<PluginTabOpened, z.ZodTypeDef, unknown> = z
  .object({
    tab: pluginTabSchema,
    surfaces: z.array(a2uiSurfaceSchema),
    revision: z.number().int().nonnegative(),
  })
  .passthrough()
  .transform(({ tab, surfaces, revision }) => ({ tab, surfaces, revision }));

/** The `plugin_tab.*` events that keep an open tab current. */
export const PLUGIN_TAB_EVENT_TYPES = [
  'plugin_tab.surface.upserted',
  'plugin_tab.surface.deleted',
  'plugin_tab.refreshed',
  'plugin_tab.unavailable',
] as const;

export type PluginTabEvent =
  | { type: 'plugin_tab.surface.upserted'; tab_id: string; revision: number; surface: A2UISurface }
  | { type: 'plugin_tab.surface.deleted'; tab_id: string; revision: number; surface_id: string }
  | { type: 'plugin_tab.refreshed'; tab_id: string; revision: number; surface_ids: string[] }
  | { type: 'plugin_tab.unavailable'; tab_id: string; reason: string; detail: string };

/** Decodes one `plugin_tab.*` event payload, or undefined for anything else. */
export function decodePluginTabEvent(type: string, payload: unknown): PluginTabEvent | undefined {
  const base = z.object({ tab_id: z.string() }).passthrough();
  switch (type) {
    case 'plugin_tab.surface.upserted': {
      const parsed = base
        .extend({ revision: z.number().int().nonnegative(), surface: a2uiSurfaceSchema })
        .safeParse(payload);
      return parsed.success
        ? {
            type,
            tab_id: parsed.data.tab_id,
            revision: parsed.data.revision,
            surface: parsed.data.surface,
          }
        : undefined;
    }
    case 'plugin_tab.surface.deleted': {
      const parsed = base
        .extend({ revision: z.number().int().nonnegative(), surface_id: z.string() })
        .safeParse(payload);
      return parsed.success
        ? {
            type,
            tab_id: parsed.data.tab_id,
            revision: parsed.data.revision,
            surface_id: parsed.data.surface_id,
          }
        : undefined;
    }
    case 'plugin_tab.refreshed': {
      const parsed = base
        .extend({ revision: z.number().int().nonnegative(), surface_ids: z.array(z.string()) })
        .safeParse(payload);
      return parsed.success
        ? {
            type,
            tab_id: parsed.data.tab_id,
            revision: parsed.data.revision,
            surface_ids: parsed.data.surface_ids,
          }
        : undefined;
    }
    case 'plugin_tab.unavailable': {
      const parsed = base
        .extend({ reason: z.string().default(''), detail: z.string().default('') })
        .safeParse(payload);
      return parsed.success
        ? {
            type,
            tab_id: parsed.data.tab_id,
            reason: parsed.data.reason,
            detail: parsed.data.detail,
          }
        : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * A plugin's primary navigation page: a left-bar entry that opens the
 * plugin's surfaces full width. Pages are global. Each runs in one
 * host-owned context session that belongs to no conversation; its events,
 * consent and questions arrive on that session's stream.
 */
export const pluginPageSchema = pluginTabSchema.extend({
  page: z.string().default(''),
  placement: z.string().default('primary'),
  context_session_id: z.string().nullable().default(null),
});

export type PluginPage = z.infer<typeof pluginPageSchema>;

export const pluginPageListSchema = z
  .object({ pages: z.array(pluginPageSchema) })
  .passthrough()
  .transform((value) => value.pages);

export interface PluginPageOpened {
  page: PluginPage;
  context_session_id: string;
  surfaces: A2UISurface[];
  revision: number;
}

export const pluginPageOpenedSchema: z.ZodType<PluginPageOpened, z.ZodTypeDef, unknown> = z
  .object({
    page: pluginPageSchema,
    context_session_id: z.string(),
    surfaces: z.array(a2uiSurfaceSchema),
    revision: z.number().int().nonnegative(),
  })
  .passthrough()
  .transform(({ page, context_session_id, surfaces, revision }) => ({
    page,
    context_session_id,
    surfaces,
    revision,
  }));

/**
 * Decodes one `plugin_page.*` event as its `plugin_tab.*` twin: a page's
 * surfaces follow the tab rules, with `page_id` in place of `tab_id`.
 */
export function decodePluginPageEvent(type: string, payload: unknown): PluginTabEvent | undefined {
  if (!type.startsWith('plugin_page.')) return undefined;
  const parsed = z.object({ page_id: z.string() }).passthrough().safeParse(payload);
  if (!parsed.success) return undefined;
  const { page_id, ...rest } = parsed.data;
  return decodePluginTabEvent(`plugin_tab.${type.slice('plugin_page.'.length)}`, {
    ...rest,
    tab_id: page_id,
  });
}

/** HS1: a server's A2UI payload CLIO would not show. */
export interface A2uiServerSurfaceRefusal {
  plugin: string;
  /** The plugin's display name, when it declares one. */
  plugin_title?: string;
  server: string;
  tool: string;
  uri: string;
  reason: string;
  detail: string;
}

export const A2UI_SERVER_SURFACE_REFUSED_EVENT = 'a2ui.server_surface.refused';

export function decodeA2uiServerSurfaceRefusal(
  payload: unknown,
): A2uiServerSurfaceRefusal | undefined {
  const parsed = z
    .object({
      plugin: z.string().default(''),
      plugin_title: z.string().default(''),
      server: z.string().default(''),
      tool: z.string().default(''),
      uri: z.string().default(''),
      reason: z.string().default(''),
      detail: z.string().default(''),
    })
    .passthrough()
    .safeParse(payload);
  return parsed.success
    ? {
        plugin: parsed.data.plugin,
        plugin_title: parsed.data.plugin_title,
        server: parsed.data.server,
        tool: parsed.data.tool,
        uri: parsed.data.uri,
        reason: parsed.data.reason,
        detail: parsed.data.detail,
      }
    : undefined;
}
