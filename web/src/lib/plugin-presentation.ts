import {
  sessionAgentRef,
  type AgentEntry,
  type AgentResolution,
  type PluginProvenance,
  type RemovalPreview,
  type ResolvedPlugin,
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

/** The pack each active plugin arrived through, so a member can name its pack. */
export function packOf(plugin: ResolvedPlugin): string | undefined {
  return plugin.provenance.source === 'pack' && plugin.provenance.via
    ? plugin.provenance.via
    : undefined;
}

/** Plugins whose own provenance names `pluginId` (pack members, cascaded requirements). */
export function broughtBy(resolution: AgentResolution, pluginId: string): ResolvedPlugin[] {
  return resolution.plugins.filter(
    (plugin) =>
      plugin.id !== pluginId &&
      (plugin.provenance.source === 'pack' || plugin.provenance.source === 'required') &&
      plugin.provenance.via === pluginId,
  );
}

/** Every plugin that leaves with a removal, the removed plugin first. */
export function removalSet(preview: RemovalPreview): string[] {
  const own = preview.removes.find((row) => row.id === preview.plugin);
  const rest = preview.removes.filter((row) => row.id !== preview.plugin).map((row) => row.id);
  return [own?.id ?? preview.plugin, ...rest];
}

/** A short name for an agent reference when the installed list does not carry it. */
export function agentDisplayName(ref: string, agents: readonly AgentEntry[] | undefined): string {
  const agent = agents?.find((row) => row.ref === ref);
  if (agent?.name) return agent.name;
  return ref.split('/').at(-1) || ref || 'Agent';
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
