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
import type { McpServerDefinition } from '@clio/core/v3';
import { humanizeToolName } from '@/components/clio/tool-presentation';
import type { ClioStatusValue } from '@/components/clio/status';

/**
 * The two services every deployment has. They are part of the agent rather than
 * something an operator installed, so the client owns their prose — there is no
 * external service to ask.
 */
const BUILTIN_TITLES: Record<string, string> = {
  fs: 'Files',
  filesystem: 'Files',
  shell: 'Commands',
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
 * The status word a reader sees, and the severity it is drawn with.
 *
 * A status this client does not recognise keeps the service's own word rather
 * than collapsing to a generic "Degraded". The service reported something
 * specific; replacing it with a severity throws away the only detail that says
 * what actually happened, and makes two unrelated failures look identical.
 */
export function serviceStatus(server: McpServerDefinition): {
  label: string;
  value: ClioStatusValue;
} {
  if (server.status === 'ready') {
    return { label: server.session_id ? 'Connected' : 'Ready', value: 'healthy' };
  }
  if (server.status === 'available') return { label: 'Starts on use', value: 'pending' };
  return { label: humanizeStatus(server.status), value: 'degraded' };
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

/** The agent blueprint a session's services came from, when they name one. */
export function sessionAgentName(
  sessionServers: readonly McpServerDefinition[],
): string | undefined {
  return sessionServers.find((server) => server.agent_blueprint_name)?.agent_blueprint_name;
}
