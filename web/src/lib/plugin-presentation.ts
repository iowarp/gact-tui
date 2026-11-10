import {
  sessionAgentRef,
  type AgentEntry,
  type AgentResolution,
  pluginReferenceId,
  type PluginDiagnostic,
  type PluginProvenance,
  type PromptFragment,
  type RemovedPlugin,
} from '@clio/core/v3';

/**
 * Where an active plugin came from, as a person reads it: core (every agent
 * carries it), an agent layer such as standard or science, a pack, a hard
 * requirement of another plugin, or the person's own addition.
 */
export function provenanceLabel(provenance: PluginProvenance): string {
  switch (provenance.source) {
    case 'core':
      return 'Core';
    case 'agent':
      return provenance.via ? `From ${provenance.via}` : 'From the agent';
    case 'pack':
      return provenance.via ? `In pack ${provenance.via}` : 'In a pack';
    case 'required':
      return provenance.via ? `Required by ${provenance.via}` : 'Required by another plugin';
    case 'user':
      return 'Added by you';
    default:
      return provenance.label || 'Origin not reported';
  }
}

/** A longer explanation for the provenance badge's tooltip. */
export function provenanceDetail(provenance: PluginProvenance): string {
  switch (provenance.source) {
    case 'core':
      return 'Every agent carries the core plugin. It cannot be removed.';
    case 'agent':
      return `The ${provenance.via || 'agent'} agent layer selects this plugin.`;
    case 'pack':
      return `A member of the ${provenance.via || ''} pack. Removing it keeps the rest of the pack.`;
    case 'required':
      return `${provenance.via || 'Another plugin'} needs this plugin. Removing it also removes what needs it.`;
    case 'user':
      return 'You added this plugin to the conversation.';
    default:
      return 'The service reported an origin this app does not recognize yet.';
  }
}

export const PROMPT_SECTION_LABELS: Record<string, string> = {
  identity: 'Identity',
  guidelines: 'Operating guidelines',
  rendering: 'Rendering',
  capabilities: 'Capabilities',
  domain: 'Domain',
};

export function promptSectionLabel(section: string): string {
  return PROMPT_SECTION_LABELS[section] ?? section.replaceAll(/[-_]/gu, ' ');
}

/** The owner a fragment is attributed to: a plugin id, or the agent itself (`agent:<id>`). */
export function fragmentOwnerLabel(owner: string): string {
  if (owner.startsWith('agent:')) return `Agent ${owner.slice('agent:'.length)}`;
  return owner || 'Owner not reported';
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
  return id || ref || 'Agent';
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

function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** A one-line count of what a plugin adds, such as "6 tools, 2 skills, 3 prompt parts". */
export function capabilitySummary(contributions: PluginContributions): string {
  const parts = [
    [contributions.tools.length + contributions.deferredTools.length, 'tool'],
    [contributions.skills.length, 'skill'],
    [contributions.fragments.length, 'prompt part'],
    [contributions.mcpServers.length, 'MCP server'],
    [contributions.flows.length, 'flow'],
    [contributions.subagents.length, 'subagent'],
    [contributions.commands.length, 'command'],
    [contributions.hooks.length, 'hook'],
    [contributions.catalogs.length, 'catalog'],
  ] as const;
  const named = parts.filter(([count]) => count > 0).map(([count, noun]) => counted(count, noun));
  return named.length ? named.join(', ') : 'Nothing of its own';
}

/** A pack's member count, naming how many are active when some have left. */
export function packMembersLabel(total: number, active: number): string {
  const noun = total === 1 ? 'member' : 'members';
  return active === total
    ? `${total} ${noun}`
    : `${active} of ${total} ${noun} in this conversation`;
}

/** Why a plugin the person did not remove left the conversation. */
export function removedPluginReason(row: RemovedPlugin): string {
  switch (row.reason) {
    case 'pack_empty':
      return 'Left because none of its members remain';
    case 'removed':
      return row.because ? `Left with its pack ${row.because}` : 'Removed';
    default:
      return row.because
        ? `Left with ${row.because}, which it requires`
        : 'Left with a removed requirement';
  }
}

/** Why a plugin leaves with a removal, as the removal preview lists it. */
export function removalPreviewReason(reason: { reason: string; because: string }): string {
  switch (reason.reason) {
    case 'pack_empty':
      return 'none of its members remain';
    case 'removed':
      return reason.because ? `in pack ${reason.because}` : 'leaves with it';
    default:
      return reason.because ? `requires ${reason.because}` : 'leaves with it';
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

/** "Plugins changed: +shell, −document-runtime (2 new tools)", or "Plugins changed". */
export function pluginChangeLabel(text: string): string {
  const { added, removed } = pluginChangeSummary(text);
  const items = [...added.map((id) => `+${id}`), ...removed.map((id) => `−${id}`)];
  const tools = pluginChangeTools(text).length;
  const reach = tools ? ` (${tools} new ${tools === 1 ? 'tool' : 'tools'})` : '';
  return (items.length ? `Plugins changed: ${items.join(', ')}` : 'Plugins changed') + reach;
}
