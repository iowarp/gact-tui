/**
 * How an MCP server is named, described, statused and grouped for a reader.
 *
 * One owner for both surfaces that list services — the Infrastructure page and
 * the navigation rail — so a service cannot be called one thing in the rail and
 * another on the page it links to.
 *
 * The governing rule is that the service describes itself. Anything the client
 * adds is a fallback for a service that said nothing, never an override: a
 * client-side table keyed on server names is a guess that goes stale the moment
 * a deployment names a server something else, and it silently relabels a
 * service the reader may be relying on the page to identify honestly.
 */
import type { McpServerDefinition, SavedMcpService, ToolCatalogItem } from '@clio/core/v3';
import { humanizeToolName } from '@/components/clio/tool-presentation';
import type { StatusTone } from '@/components/clio/primitives/status-indicator';
import { truncate } from '@/lib/format';
import { mcpServerPreparation } from '@/lib/mcp-preparation';
import { SUMMARY_TRUNCATE_CHARS } from '@/lib/runtime-limits';

/**
 * The two services every deployment has. They are part of the agent rather than
 * something an operator installed, so the client owns their prose — there is no
 * external service to ask.
 */
const BUILTIN_TITLES: Record<string, string> = {
  fs: 'Workspace files',
  filesystem: 'Workspace files',
  shell: 'Local commands',
};

const BUILTIN_DESCRIPTIONS: Record<string, string> = {
  fs: 'Read and edit files allowed by this workspace',
  filesystem: 'Read and edit files allowed by this workspace',
  shell: 'Run commands inside the workspace’s permitted folders',
};

function specString(server: McpServerDefinition, key: string): string | undefined {
  const value = server.spec[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** What to call a service: its own title, then a builtin name, then its id. */
export function serviceTitle(server: McpServerDefinition): string {
  return (
    specString(server, 'title') ??
    specString(server, 'display_name') ??
    BUILTIN_TITLES[server.id] ??
    BUILTIN_TITLES[server.name] ??
    humanizeToolName(server.name || server.id)
  );
}

/** What a service does: its own description, then a builtin, then its origin. */
export function serviceDescription(server: McpServerDefinition): string {
  return (
    specString(server, 'description') ??
    BUILTIN_DESCRIPTIONS[server.id] ??
    BUILTIN_DESCRIPTIONS[server.name] ??
    (server.transport === 'in_process'
      ? 'Provided by the connected agent'
      : 'Adds tools from a connected service')
  );
}

/**
 * What a settings list calls one service entry: the service's own title, a
 * builtin's name, then the saved label, then the name it was registered under.
 * Names a person typed (`home-assistant`) stay exactly as typed.
 */
export function serviceEntryTitle(entry: {
  name: string;
  server?: McpServerDefinition;
  saved?: SavedMcpService;
}): string {
  const server = entry.server;
  if (server) {
    const own = specString(server, 'title') ?? specString(server, 'display_name');
    if (own) return own;
    if (server.transport === 'in_process')
      return (
        BUILTIN_TITLES[server.name] ?? BUILTIN_TITLES[server.id] ?? humanizeToolName(server.name)
      );
  }
  return entry.saved?.label?.trim() || entry.name || server?.id || 'MCP server';
}

/** How a service runs, which picks its glyph: files, commands, a plugin's server, a URL. */
export type McpServiceKind = 'files' | 'commands' | 'plugin' | 'remote' | 'local';

function remoteTransport(transport: string | undefined): boolean {
  return transport === 'http' || transport === 'streamable-http' || transport === 'sse';
}

export function serviceKind(entry: {
  server?: McpServerDefinition;
  saved?: SavedMcpService;
}): McpServiceKind {
  const server = entry.server;
  if (server?.transport === 'in_process')
    return server.name === 'shell' ? 'commands' : server.name === 'fs' ? 'files' : 'plugin';
  if (server?.source === 'plugin') return 'plugin';
  const transport = entry.saved?.transport ?? server?.transport;
  if (remoteTransport(transport) || typeof (server?.spec ?? entry.saved?.spec)?.url === 'string')
    return 'remote';
  return 'local';
}

/** Where the service came from, in words: built in, a plugin's, or the person's own. */
export function serviceOrigin(entry: {
  server?: McpServerDefinition;
  saved?: SavedMcpService;
}): string {
  const server = entry.server;
  if (server?.transport === 'in_process') return 'Built in';
  if (server?.source === 'plugin')
    return server.plugin ? `From plugin ${server.plugin}` : 'From a plugin';
  const remote = serviceKind(entry) === 'remote';
  if (entry.saved) return `Yours, ${remote ? 'remote service' : 'local command'}`;
  return remote ? 'Remote service' : 'Local command';
}

/**
 * What the service connects to, short enough for one meta line: the host of a
 * remote service, or the command line of a local one. Built-in and plugin
 * services say nothing here; the plugin owns how its server starts.
 */
export function serviceTarget(entry: {
  server?: McpServerDefinition;
  saved?: SavedMcpService;
}): { short: string; full: string; kind: 'url' | 'command' } | undefined {
  const server = entry.server;
  if (server?.transport === 'in_process' || server?.source === 'plugin') return undefined;
  const spec = entry.saved?.spec ?? server?.spec ?? {};
  if (typeof spec.url === 'string' && spec.url.trim()) {
    const full = spec.url.trim();
    try {
      return { short: new URL(full).host || full, full, kind: 'url' };
    } catch {
      return { short: full, full, kind: 'url' };
    }
  }
  if (typeof spec.command === 'string' && spec.command.trim()) {
    const args = Array.isArray(spec.args) ? spec.args.map(String) : [];
    const full = [spec.command.trim(), ...args].join(' ');
    return { short: shortCommand(full), full, kind: 'command' };
  }
  return undefined;
}

const COMMAND_RUNNERS = new Set(['uvx', 'npx', 'pnpx', 'bunx', 'pipx', 'uv', 'docker', 'podman']);

/** A command's short id for a list row: the runner and its package, or the program's name. */
function shortCommand(full: string): string {
  const words = full.split(/\s+/u).filter(Boolean);
  const program = (words[0] ?? full)
    .split(/[\\/]/u)
    .at(-1)!
    .replace(/\.(exe|cmd|bat)$/iu, '');
  if (!COMMAND_RUNNERS.has(program.toLowerCase())) return program;
  const target = words.slice(1).find((word) => !word.startsWith('-') && word !== 'run');
  return target ? `${program} ${target.split(/[\\/]/u).at(-1)}` : program;
}

/**
 * The status word a reader sees, and the tone it is drawn with.
 *
 * A service the listing does not report (only saved) has not started. A status
 * this client does not recognise keeps the service's own word rather than
 * collapsing to a generic one: the service reported something specific, and
 * replacing it throws away the only detail that says what actually happened.
 */
export function serviceStatus(server: McpServerDefinition | undefined): {
  label: string;
  tone: StatusTone;
} {
  if (!server || server.status === 'stopped') return { label: 'Not started', tone: 'stopped' };
  if (server.status === 'ready') return { label: 'Running', tone: 'success' };
  const preparation = mcpServerPreparation(server);
  if (preparation?.state === 'preparing') return { label: preparation.label, tone: 'running' };
  if (preparation?.state === 'failed') return { label: 'Unavailable', tone: 'error' };
  if (server.status === 'available') return { label: 'Starts when used', tone: 'idle' };
  if (server.status === 'error' || server.status === 'degraded')
    return { label: 'Unavailable', tone: 'error' };
  return { label: humanizeStatus(server.status), tone: 'warning' };
}

function humanizeStatus(status: string): string {
  const spaced = status.replaceAll('_', ' ').trim();
  if (!spaced) return 'Unknown';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * How many tools a service exposes, or nothing when it did not say.
 *
 * Zero is an answer — a service that is up and exposes nothing — and is
 * reported as such. Only an absent count is silent.
 */
export function serviceToolCount(server: McpServerDefinition): string | undefined {
  const count = server.tools_count;
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return undefined;
  return `${count} ${count === 1 ? 'tool' : 'tools'}`;
}

export interface McpServiceGrouping {
  /** Services this session opened for itself. Empty unless `grouped`. */
  sessionServers: McpServerDefinition[];
  /** Services shared across the agent service. Empty unless `grouped`. */
  sharedServers: McpServerDefinition[];
  /** Every service, in listing order. The only list to render when ungrouped. */
  allServers: McpServerDefinition[];
  /** True when the split is meaningful and should be rendered. */
  grouped: boolean;
  /**
   * True when a session was asked about but the service answered without
   * saying which session owns anything — an older backend that ignored the
   * parameter. The reader is told rather than shown a split that would be a
   * guess.
   */
  sessionIgnored: boolean;
}

/**
 * Split a listing into the session's own services and the shared ones.
 *
 * Membership requires a server to actually carry the session's id. Testing
 * `server.session_id === sessionId` alone put every shared service — which
 * carries no `session_id` at all — into the session's group whenever no session
 * was in view, which is precisely backwards. With no session in view there is
 * nothing to split on, so the plain list is the honest answer.
 */
export function groupSessionServices(
  servers: readonly McpServerDefinition[] | undefined,
  sessionId: string | undefined,
): McpServiceGrouping {
  const allServers = [...(servers ?? [])];
  const ungrouped: McpServiceGrouping = {
    allServers,
    grouped: false,
    sessionIgnored: false,
    sessionServers: [],
    sharedServers: [],
  };
  if (sessionId === undefined) return ungrouped;
  if (allServers.length && allServers.every((server) => server.session_id == null)) {
    return { ...ungrouped, sessionIgnored: true };
  }
  return {
    allServers,
    grouped: true,
    sessionIgnored: false,
    sessionServers: allServers.filter((server) => server.session_id === sessionId),
    sharedServers: allServers.filter((server) => server.session_id !== sessionId),
  };
}

const KNOWN_SUMMARIES: Record<string, string> = {
  fs_read_file: 'Reads a file that this workspace has granted the agent access to.',
  fs_write_file:
    'Creates a file or replaces its content in the workspace; each change can be undone.',
  fs_edit_file: 'Replaces exact text in a workspace file; each change can be undone.',
  shell_bash: 'Runs a command inside the workspace’s permitted folders.',
};

/** One sentence on what a tool does, from a known builtin or the tool's own description. */
export function toolSummary(name: string, tool?: Pick<ToolCatalogItem, 'description'>): string {
  if (KNOWN_SUMMARIES[name]) return KNOWN_SUMMARIES[name];
  const description = tool?.description
    ?.replace(/``(.+?)``/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!description) return '';
  const firstSentence = description.match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() ?? description;
  return truncate(firstSentence, SUMMARY_TRUNCATE_CHARS);
}
