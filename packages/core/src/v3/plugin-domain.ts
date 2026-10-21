import { z } from 'zod';
import { forwardCompatibleEnum } from './schema-utils.js';

/**
 * Plugins, packs, agents and their resolution.
 *
 * An agent is a flow, an identity and a set of plugins. A pack is a plugin
 * whose content is only membership in other plugins. A user agent is a parent
 * agent plus a delta (plugins added and removed), never a flattened list. A
 * session pins one resolution of its agent; the + menu changes the session's
 * delta, and the server pins the new resolution.
 */

const strings = z.array(z.string()).default([]);

export const pluginDiagnosticSchema = z
  .object({
    severity: forwardCompatibleEnum(['error', 'warning', 'info']).default('error'),
    code: z.string().default(''),
    message: z.string().default(''),
    plugin: z.string().nullish(),
  })
  .passthrough();

export type PluginDiagnostic = z.infer<typeof pluginDiagnosticSchema>;

const diagnostics = z.array(pluginDiagnosticSchema).default([]);

/** One installed plugin or pack, as the + menu lists it (`GET /v1/plugins`). */
export const pluginEntrySchema = z.object({
  id: z.string(),
  ref: z.string(),
  version: z.string().default(''),
  description: z.string().default(''),
  kind: forwardCompatibleEnum(['plugin', 'pack']).default('plugin'),
  format: z.string().default(''),
  marketplace: z.string().default(''),
  requires: strings,
  members: strings,
  tools: strings,
  skills: strings,
  mcp_servers: strings,
  subagents: strings,
  flows: strings,
  hooks: strings,
  commands: strings,
  catalogs: strings,
  fragments: strings,
  trusted: z.boolean().default(false),
  pending_trust: z.boolean().default(false),
  diagnostics,
});

export type PluginEntry = z.infer<typeof pluginEntrySchema>;

/** Why the default marketplace could not be installed; other marketplaces still work. */
export const marketplaceErrorSchema = z
  .object({ reason: z.string().default(''), source: z.string().default(''), message: z.string() })
  .passthrough();

export const pluginCatalogSchema = z.object({
  plugins: z.array(pluginEntrySchema).default([]),
  default_marketplace_error: marketplaceErrorSchema.nullish().transform((value) => value ?? null),
});

export type PluginCatalog = z.infer<typeof pluginCatalogSchema>;

/** An installed marketplace: a source of plugins and agents, trusted or awaiting trust. */
export const pluginMarketplaceSchema = z.object({
  name: z.string(),
  source: z.string().default(''),
  commit: z.string().default(''),
  format: z.string().default(''),
  trusted: z.boolean().default(false),
  trust_reason: z.string().default(''),
  default: z.boolean().default(false),
  parent: z.string().default(''),
  installed_at: z.string().default(''),
  diagnostics,
});

export type PluginMarketplace = z.infer<typeof pluginMarketplaceSchema>;

/** What an install, update or trust step applied, and what still waits for trust. */
export const marketplaceSummarySchema = z
  .object({
    marketplace: z.string(),
    format: z.string().default(''),
    trusted: z.boolean().default(false),
    plugins: strings,
    pending_trust: strings,
    agents: strings,
    diagnostics,
  })
  .passthrough();

export type MarketplaceSummary = z.infer<typeof marketplaceSummarySchema>;

export const pluginCheckTargetSchema = z.object({
  kind: z.string(),
  id: z.string(),
  ok: z.boolean(),
  diagnostics,
});

/** `plugin check`: the install resolver's verdict on a marketplace or folder. */
export const pluginCheckReportSchema = z.object({
  source: z.string().default(''),
  ok: z.boolean(),
  targets: z.array(pluginCheckTargetSchema).default([]),
  diagnostics,
  text: z.string().default(''),
});

export type PluginCheckReport = z.infer<typeof pluginCheckReportSchema>;

export const agentDeltaSchema = z.object({ add: strings, remove: strings });

export type AgentDelta = z.infer<typeof agentDeltaSchema>;

export const emptyAgentDelta: AgentDelta = { add: [], remove: [] };

const flowSelectionSchema = z
  .object({ id: z.string(), options: z.record(z.string(), z.unknown()).default({}) })
  .passthrough();

/** An installed agent (`GET /v1/agents`); a user agent carries its parent and delta. */
export const agentEntrySchema = z.object({
  ref: z.string(),
  id: z.string(),
  name: z.string().default(''),
  description: z.string().default(''),
  role: z.string().default(''),
  version: z.string().default(''),
  marketplace: z.string().default(''),
  flow: flowSelectionSchema.nullish(),
  plugins: z
    .array(z.object({ ref: z.string(), layer: z.string().default('') }).passthrough())
    .default([]),
  spec_checksum: z.string().default(''),
  kind: forwardCompatibleEnum(['agent', 'user']).default('agent'),
  extends: z.string().optional(),
  delta: agentDeltaSchema.optional(),
});

export type AgentEntry = z.infer<typeof agentEntrySchema>;

/**
 * Where an active plugin came from: `core` (every agent), `agent` (an agent
 * layer such as standard or science, named by `via`), `pack` (a member of the
 * pack named by `via`), `required` (a hard requirement of `via`) or `user`.
 */
export const pluginProvenanceSchema = z.object({
  source: forwardCompatibleEnum(['core', 'agent', 'pack', 'required', 'user']),
  via: z.string().default(''),
  label: z.string().default(''),
});

export type PluginProvenance = z.infer<typeof pluginProvenanceSchema>;

export const resolvedPluginSchema = z.object({
  id: z.string(),
  version: z.string().default(''),
  kind: forwardCompatibleEnum(['plugin', 'pack']).default('plugin'),
  marketplace: z.string().default(''),
  description: z.string().default(''),
  provenance: pluginProvenanceSchema,
  requires: strings,
  members: strings,
  removable: z.boolean().default(true),
});

export type ResolvedPlugin = z.infer<typeof resolvedPluginSchema>;

export const removedPluginSchema = z.object({
  id: z.string(),
  reason: z.string().default(''),
  because: z.string().default(''),
});

export type RemovedPlugin = z.infer<typeof removedPluginSchema>;

const contributionSchema = z
  .object({ id: z.string(), plugin: z.string().default(''), description: z.string().default('') })
  .passthrough();

export const resolvedToolSchema = z
  .object({ name: z.string(), plugin: z.string().default(''), description: z.string().default('') })
  .passthrough();

export const promptFragmentSchema = z.object({
  id: z.string(),
  plugin: z.string().default(''),
  section: z.string().default(''),
  text: z.string().default(''),
  tokens: z.number().nonnegative().optional(),
});

export type PromptFragment = z.infer<typeof promptFragmentSchema>;

export const promptSectionSchema = z.object({
  section: z.string(),
  fragments: z.array(promptFragmentSchema).default([]),
});

export type PromptSection = z.infer<typeof promptSectionSchema>;

/** The resolution's agent identity (a user agent names its parent in `parent`). */
export const resolvedAgentSchema = z
  .object({
    ref: z.string(),
    id: z.string(),
    name: z.string().default(''),
    role: z.string().default(''),
    description: z.string().default(''),
    version: z.string().default(''),
    marketplace: z.string().default(''),
    parent: z.string().default(''),
    kind: forwardCompatibleEnum(['agent', 'user']).default('agent'),
  })
  .passthrough();

/** Stage 2 of resolution: the plugin set with provenance and the composed main prompt. */
export const agentResolutionSchema = z.object({
  agent: resolvedAgentSchema,
  plugins: z.array(resolvedPluginSchema).default([]),
  removed: z.array(removedPluginSchema).default([]),
  tools: z.array(resolvedToolSchema).default([]),
  skills: z.array(contributionSchema).default([]),
  subagents: z.array(contributionSchema).default([]),
  flows: z.array(contributionSchema).default([]),
  hooks: z.array(contributionSchema).default([]),
  commands: z.array(contributionSchema).default([]),
  catalogs: z.array(contributionSchema).default([]),
  mcp_servers: z
    .record(z.string(), z.object({ plugin: z.string().default('') }).passthrough())
    .default({}),
  prompt: z
    .object({
      sections: z.array(promptSectionSchema).default([]),
      digest: z.string().default(''),
      warnings: strings,
    })
    .default({}),
  delta: agentDeltaSchema.default(emptyAgentDelta),
  diagnostics,
  digest: z.string().default(''),
});

export type AgentResolution = z.infer<typeof agentResolutionSchema>;

/** `GET|PATCH /v1/sessions/{sid}/agent`: the session's pinned resolution and live delta. */
export const sessionAgentSchema = z.object({
  session_id: z.string(),
  delta: agentDeltaSchema.default(emptyAgentDelta),
  subagent: z.boolean().default(false),
  resolution: agentResolutionSchema,
});

export type SessionAgent = z.infer<typeof sessionAgentSchema>;

/** The cascade preview for removing one plugin: everything that leaves with it. */
export const removalPreviewSchema = z.object({
  plugin: z.string(),
  removes: z
    .array(
      z.object({
        id: z.string(),
        reason: z
          .object({ reason: z.string().default(''), because: z.string().default('') })
          .passthrough(),
      }),
    )
    .default([]),
  tools_removed: strings,
});

export type RemovalPreview = z.infer<typeof removalPreviewSchema>;

/** The agent a session runs, from the pin carried in its metadata. */
export function sessionAgentRef(session: { metadata?: Record<string, unknown> } | undefined) {
  const value = session?.metadata?.agent_ref;
  return typeof value === 'string' ? value : '';
}

/**
 * The plugin id a delta reference names: `<id>`, `<id>@<range>` or
 * `<marketplace>/<id>[@<range>]` (the `ref` /v1/plugins advertises).
 */
export function pluginReferenceId(reference: string): string {
  const name = reference.split('@', 1)[0]!.trim();
  return name.slice(name.lastIndexOf('/') + 1);
}

/**
 * Apply one + menu change to a delta. References compare by plugin id, as the
 * server applies them. Adding a plugin the delta removed restores it; removing
 * a plugin the delta added drops the addition; adding a plugin again replaces
 * the earlier reference (another marketplace or version range).
 */
export function deltaWith(
  delta: AgentDelta,
  change: { add: string } | { remove: string },
): AgentDelta {
  const same = (id: string) => (reference: string) => pluginReferenceId(reference) === id;
  if ('add' in change) {
    const id = pluginReferenceId(change.add);
    if (delta.remove.some(same(id))) {
      return { add: delta.add, remove: delta.remove.filter((reference) => !same(id)(reference)) };
    }
    return {
      add: [...delta.add.filter((reference) => !same(id)(reference)), change.add],
      remove: delta.remove,
    };
  }
  const id = pluginReferenceId(change.remove);
  if (delta.add.some(same(id))) {
    return { add: delta.add.filter((reference) => !same(id)(reference)), remove: delta.remove };
  }
  return delta.remove.some(same(id))
    ? delta
    : { ...delta, remove: [...delta.remove, change.remove] };
}
