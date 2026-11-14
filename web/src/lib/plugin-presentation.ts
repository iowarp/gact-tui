import {
  sessionAgentRef,
  type AgentEntry,
  type AgentResolution,
  type Connector,
  type PluginEntry,
  pluginReferenceId,
  type PluginDiagnostic,
  type PluginProvenance,
  type PromptFragment,
  type RemovedPlugin,
  type ResolvedPlugin,
} from '@clio/core/v3';
import { plural, t, ph } from '@lingui/core/macro';

/**
 * Where an active plugin came from, as a person reads it: core (every agent
 * carries it), an agent layer such as standard or science, a pack, a hard
 * requirement of another plugin, the person's own addition, or (from an older
 * service) a connector the person enabled.
 */
export function provenanceLabel(provenance: PluginProvenance): string {
  switch (provenance.source) {
    case 'core':
      return t`Built in`;
    case 'agent':
      return provenance.via ? t`From ${ph({ via: provenance.via })}` : t`From the agent`;
    case 'pack':
      return provenance.via ? t`In pack ${ph({ via: provenance.via })}` : t`In a pack`;
    case 'required':
      return provenance.via
        ? t`Required by ${ph({ via: provenance.via })}`
        : t`Required by another plugin`;
    case 'user':
      return t`Added by you`;
    case 'connector':
      return provenance.label || t`From connector ${ph({ via: provenance.via })}`;
    default:
      return provenance.label || t`Origin not reported`;
  }
}

/** How an active plugin is named: a connector's plugin by its connector (CN10). */
export function resolvedPluginName(plugin: Pick<ResolvedPlugin, 'id' | 'connector'>): string {
  return plugin.connector?.name || plugin.id;
}

/** An active plugin's origin in words; a connector's plugin says it is a connector. */
export function resolvedPluginOrigin(plugin: Pick<ResolvedPlugin, 'provenance' | 'connector'>) {
  const label = provenanceLabel(plugin.provenance);
  if (!plugin.connector) return label;
  return plugin.provenance.source === 'user'
    ? 'Connector you added'
    : `Connector (${label.toLowerCase()})`;
}

/** A longer explanation for the provenance badge's tooltip. */
export function provenanceDetail(provenance: PluginProvenance): string {
  switch (provenance.source) {
    case 'core':
      return t`Every agent carries the core plugin. It cannot be removed.`;
    case 'agent':
      return provenance.via
        ? t`The ${ph({ via: provenance.via })} agent layer selects this plugin.`
        : t`The agent layer selects this plugin.`;
    case 'pack':
      return provenance.via
        ? t`A member of the ${ph({ via: provenance.via })} pack. Removing it keeps the rest of the pack.`
        : t`A member of a pack. Removing it keeps the rest of the pack.`;
    case 'required':
      return provenance.via
        ? t`${ph({ via: provenance.via })} needs this plugin. Removing it also removes what needs it.`
        : t`Another plugin needs this plugin. Removing it also removes what needs it.`;
    case 'user':
      return t`You added this plugin to the conversation.`;
    case 'connector':
      return t`It belongs to a connector you enabled in Extensions.`;
    default:
      return t`The service reported an origin this app does not recognize yet.`;
  }
}

export const PROMPT_SECTION_LABELS: Record<string, string> = {
  identity: t`Identity`,
  guidelines: t`Operating guidelines`,
  rendering: t`Rendering`,
  capabilities: t`Capabilities`,
  domain: t`Domain`,
  plugins: t`Packages`,
};

export function promptSectionLabel(section: string): string {
  return PROMPT_SECTION_LABELS[section] ?? section.replaceAll(/[-_]/gu, ' ');
}

/** The owner a fragment is attributed to: a plugin id, or the agent itself (`agent:<id>`). */
export function fragmentOwnerLabel(owner: string): string {
  if (owner.startsWith('agent:')) return t`Agent ${ph({ name: owner.slice('agent:'.length) })}`;
  return owner || t`Owner not reported`;
}

/** A line that starts its own Markdown block: list item, heading, quote, fence or table row. */
const BLOCK_LINE = /^\s*(?:[-*+]\s|\d+[.)]\s|#|>|```|~~~|\|)/u;

/**
 * Fragment text without its source wrapping. Prompt files are Markdown wrapped
 * at a fixed width; a wrapped line continues its paragraph, so it joins the
 * line before. Blank lines, block starts and fenced code keep their breaks, and
 * nothing else in the text changes.
 */
export function unwrapFragmentText(text: string): string {
  const out: string[] = [];
  let fenced = false;
  for (const line of text.split('\n')) {
    const fence = /^\s*(?:```|~~~)/u.test(line);
    const previous = out.length ? out[out.length - 1] : '';
    const joins =
      !fenced &&
      !fence &&
      line.trim() !== '' &&
      previous.trim() !== '' &&
      !BLOCK_LINE.test(line) &&
      !/^\s*(?:```|~~~|#|\|)/u.test(previous);
    if (joins) out[out.length - 1] = `${previous.trimEnd()} ${line.trimStart()}`;
    else out.push(line);
    if (fence) fenced = !fenced;
  }
  return out.join('\n');
}

/** A short name for an agent reference when the installed list does not carry it. */
export function agentDisplayName(ref: string, agents: readonly AgentEntry[] | undefined): string {
  // A parent reference may carry a version range (`standard@^1`) or omit the marketplace.
  const name = ref.split('@', 1)[0]!;
  const id = name.split('/').at(-1) ?? name;
  const byId = agents?.filter((row) => row.id === id) ?? [];
  const agent =
    agents?.find((row) => row.ref === name) ?? (byId.length === 1 ? byId[0] : undefined);
  if (agent?.name) return agent.name;
  return id || ref || t`Agent`;
}

/** Suggest a user-agent id from a name: lowercase words joined by dashes. */
export function userAgentId(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .slice(0, 64)
    .replaceAll(/^-+|-+$/gu, '');
}

/** The name of the agent a session runs, from its pinned reference; `undefined` when it has none. */
export function sessionAgentLabel(
  session: { metadata?: Record<string, unknown>; agent_id?: string } | undefined,
  agents: readonly AgentEntry[] | undefined,
): string | undefined {
  const ref = sessionAgentRef(session);
  if (ref) return agentDisplayName(ref, agents);
  return session?.agent_id || undefined;
}

type Contribution = AgentResolution['skills'][number];

/** An MCP server a plugin starts, with its transport type when the service reports one. */
export interface PluginMcpServer {
  name: string;
  type: string;
  /** The plugin declares this server's tools deferred (loaded with search_tools). */
  deferred: boolean;
}

/** Everything the resolution attributes to one plugin, plus the plugins that require it. */
export interface PluginContributions {
  /** Tools whose schemas are in every request. */
  tools: string[];
  /** Tools named in the prompt whose schemas the agent loads when it needs them. */
  deferredTools: string[];
  skills: Contribution[];
  fragments: PromptFragment[];
  mcpServers: PluginMcpServer[];
  flows: Contribution[];
  subagents: Contribution[];
  commands: Contribution[];
  hooks: Contribution[];
  catalogs: Contribution[];
  diagnostics: PluginDiagnostic[];
  requiredBy: string[];
}

/** What the resolution reports for `pluginId`: its rows from every contribution list. */
export function pluginContributions(
  resolution: AgentResolution,
  pluginId: string,
): PluginContributions {
  const own = <T extends { plugin?: string | null }>(rows: readonly T[]) =>
    rows.filter((row) => row.plugin === pluginId);
  return {
    tools: own(resolution.tools)
      .filter((tool) => tool.defer !== true)
      .map((tool) => tool.name),
    deferredTools: own(resolution.tools)
      .filter((tool) => tool.defer === true)
      .map((tool) => tool.name),
    skills: own(resolution.skills),
    fragments: resolution.prompt.sections.flatMap((section) => own(section.fragments)),
    mcpServers: Object.entries(resolution.mcp_servers)
      .filter(([, server]) => server.plugin === pluginId)
      .map(([name, server]) => {
        const row = server as { spec?: { type?: unknown }; defer?: unknown };
        const type = typeof row.spec?.type === 'string' ? row.spec.type : '';
        return { name, type, deferred: row.defer === true };
      }),
    flows: own(resolution.flows),
    subagents: own(resolution.subagents),
    commands: own(resolution.commands),
    hooks: own(resolution.hooks),
    catalogs: own(resolution.catalogs),
    diagnostics: own(resolution.diagnostics),
    requiredBy: resolution.plugins
      .filter((plugin) => plugin.requires.some((ref) => pluginReferenceId(ref) === pluginId))
      .map((plugin) => plugin.id),
  };
}

/** A one-line count of what a plugin adds, such as "6 tools, 2 skills, 3 prompt parts". */
export function capabilitySummary(contributions: PluginContributions): string {
  const parts: [number, (count: number) => string][] = [
    [
      contributions.tools.length + contributions.deferredTools.length,
      (count) => plural(count, { one: '# tool', other: '# tools' }),
    ],
    [contributions.skills.length, (count) => plural(count, { one: '# skill', other: '# skills' })],
    [
      contributions.fragments.length,
      (count) => plural(count, { one: '# prompt part', other: '# prompt parts' }),
    ],
    [
      contributions.mcpServers.length,
      (count) => plural(count, { one: '# MCP server', other: '# MCP servers' }),
    ],
    [contributions.flows.length, (count) => plural(count, { one: '# flow', other: '# flows' })],
    [
      contributions.subagents.length,
      (count) => plural(count, { one: '# subagent', other: '# subagents' }),
    ],
    [
      contributions.commands.length,
      (count) => plural(count, { one: '# command', other: '# commands' }),
    ],
    [contributions.hooks.length, (count) => plural(count, { one: '# hook', other: '# hooks' })],
    [
      contributions.catalogs.length,
      (count) => plural(count, { one: '# catalog', other: '# catalogs' }),
    ],
  ];
  const named = parts.filter(([count]) => count > 0).map(([count, label]) => label(count));
  return named.length ? named.join(', ') : t`Nothing of its own`;
}

/** A pack's member count, naming how many are active when some have left. */
export function packMembersLabel(total: number, active: number): string {
  return active === total
    ? plural(total, { one: '# member', other: '# members' })
    : plural(total, {
        one: `${active} of # member in this conversation`,
        other: `${active} of # members in this conversation`,
      });
}

/** Why a plugin the person did not remove left the conversation. */
export function removedPluginReason(row: RemovedPlugin): string {
  switch (row.reason) {
    case 'connector_off':
      return `Left because its connector ${row.because} is turned off; it returns when it is on`;
    case 'connector_not_found':
      return `Left because its connector ${row.because} no longer exists`;
    case 'pack_empty':
      return t`Left because none of its members remain`;
    case 'removed':
      return row.because ? t`Left with its pack ${ph({ because: row.because })}` : t`Removed`;
    default:
      return row.because
        ? t`Left with ${ph({ because: row.because })}, which it requires`
        : t`Left with a removed requirement`;
  }
}

/** Why a plugin leaves with a removal, as the removal preview lists it. */
export function removalPreviewReason(reason: { reason: string; because: string }): string {
  switch (reason.reason) {
    case 'pack_empty':
      return t`none of its members remain`;
    case 'removed':
      return reason.because ? t`in pack ${ph({ because: reason.because })}` : t`leaves with it`;
    default:
      return reason.because ? t`requires ${ph({ because: reason.because })}` : t`leaves with it`;
  }
}

/**
 * The plugins a `plugin_change` note names, read from the note itself so a
 * past turn keeps the change it carried: "Removed: a, b. Do not use …" and
 * one "Added: x." line per added plugin.
 */
export function pluginChangeSummary(text: string): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  for (const line of text.split('\n')) {
    const add = /^Added: (.+)\.$/u.exec(line.trim());
    if (add) added.push(add[1]!.trim());
    const remove = /^Removed: (.+?)\. Do not use/u.exec(line.trim());
    if (remove) removed.push(...remove[1]!.split(',').map((id) => id.trim()));
  }
  return { added, removed: removed.filter(Boolean) };
}

/**
 * The tools a plugin change made callable now, from the note's "New tools you can call
 * now" section (one "- name(arguments): description" line each).
 */
export function pluginChangeTools(text: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith('New tools you can call now'));
  if (start < 0) return [];
  const tools: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^- ([A-Za-z0-9_.-]+)\(/u.exec(line.trim());
    if (!match) break;
    tools.push(match[1]!);
  }
  return tools;
}

/** A plugin id read as words: "document-runtime" → "Document runtime". */
export function humanizePluginId(id: string): string {
  const words = id.replace(/[-_]+/gu, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : id;
}

/**
 * Person-facing names for plugin ids (FP-D5). A plugin that follows a connector, the
 * plugin a connector brings, and the carrier CLIO builds for a connector without one
 * (`connector-<id>`) are all named after the connector; any other plugin is its id read
 * as words.
 */
export function pluginNameResolver(
  plugins: readonly Pick<PluginEntry, 'id' | 'follows'>[] | undefined,
  connectors: readonly Pick<Connector, 'id' | 'name' | 'plugin'>[] | undefined,
): (id: string) => string {
  const names = new Map<string, string>();
  for (const connector of connectors ?? []) {
    names.set(`connector-${connector.id}`, connector.name);
    if (connector.plugin) names.set(connector.plugin, connector.name);
  }
  for (const plugin of plugins ?? []) {
    const followed = connectors?.find((connector) => connector.id === plugin.follows);
    if (followed) names.set(plugin.id, followed.name);
  }
  return (id) => names.get(id) ?? humanizePluginId(id);
}

/** "Plugins changed: +Shell, −Document runtime (2 new tools)", or "Plugins changed". */
export function pluginChangeLabel(
  text: string,
  nameOf: (id: string) => string = humanizePluginId,
): string {
  const { added, removed } = pluginChangeSummary(text);
  const items = [
    ...new Set([...added.map((id) => `+${nameOf(id)}`), ...removed.map((id) => `−${nameOf(id)}`)]),
  ];
  const tools = pluginChangeTools(text).length;
  const list = items.join(', ');
  if (items.length && tools)
    return plural(tools, {
      one: `Plugins changed: ${list} (# new tool)`,
      other: `Plugins changed: ${list} (# new tools)`,
    });
  if (items.length) return t`Plugins changed: ${list}`;
  if (tools)
    return plural(tools, {
      one: 'Plugins changed (# new tool)',
      other: 'Plugins changed (# new tools)',
    });
  return t`Plugins changed`;
}
