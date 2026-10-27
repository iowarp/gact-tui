/**
 * How an MCP server's preparation for a conversation reads to a person.
 *
 * The agent prepares a conversation's servers in the background: it installs a
 * server's software, starts it and lists its tools, or connects it. A failure
 * arrives as a typed reason; this module turns that reason into a plain sentence
 * and keeps the reason itself, with the agent's detail, for a Details disclosure.
 */
import type { McpServerDefinition } from '@clio/core/v3';
import type { ClioStatusValue } from '@/components/clio/status';

/** What the server is doing while it is prepared, in a person's words. */
const PHASE_LABELS: Record<string, string> = {
  provision: 'Installing',
  launch: 'Starting',
  connect: 'Connecting',
};

/** Why a server could not be prepared, in a person's words. */
const REASON_SENTENCES: Record<string, string> = {
  mcp_prepare_launcher_missing:
    'The program that runs this server is not installed on the agent’s computer.',
  mcp_prepare_provision_failed: 'The server’s software could not be installed.',
  mcp_prepare_provision_no_progress: 'Installing the server’s software stopped making progress.',
  mcp_prepare_start_failed: 'The server did not start, or it closed its connection.',
  mcp_prepare_start_no_progress: 'The server stopped responding while it was starting.',
  mcp_prepare_cache_lock_timeout: 'Another server’s installation held up this one for too long.',
  launcher_cache_lock_timeout: 'Another server’s installation held up this one for too long.',
  mcp_namespace_discovery_unreachable: 'The server could not be reached.',
  mcp_namespace_discovery_timeout: 'The server did not answer in time.',
};

const UNKNOWN_FAILURE = 'The server could not be prepared.';

/** A plain sentence for a typed preparation failure (never the reason token itself). */
export function preparationReasonSentence(reason: string | undefined): string {
  return (reason && REASON_SENTENCES[reason]) || UNKNOWN_FAILURE;
}

/** The server's preparation, when the agent reported one that is not finished well. */
export interface McpServerPreparationView {
  /** `preparing` or `failed`. */
  state: 'preparing' | 'failed';
  /** Short status words, such as "Preparing (installing)" or "Failed". */
  label: string;
  value: ClioStatusValue;
  /** One sentence a person can act on. */
  sentence: string;
  /** The typed reason, shown only inside Details. */
  reason?: string;
  /** The agent's technical detail, shown only inside Details. */
  detail?: string;
}

/**
 * The preparation to show for ``server``, or ``undefined`` when it is ready, not
 * started yet, or reported no preparation.
 */
export function mcpServerPreparation(
  server: McpServerDefinition | undefined,
): McpServerPreparationView | undefined {
  if (!server || server.status === 'ready') return undefined;
  const preparation = server.preparation;
  if (server.status === 'preparing' || preparation?.state === 'preparing') {
    const phase = PHASE_LABELS[preparation?.phase ?? ''];
    const retrying = Boolean(preparation?.reason);
    return {
      state: 'preparing',
      label: phase ? `Preparing (${phase.toLocaleLowerCase()})` : 'Preparing',
      value: 'connecting',
      sentence: retrying
        ? `${preparationReasonSentence(preparation?.reason)} Trying again.`
        : `${phase ?? 'Preparing'} the server for this conversation; its tools join when it is ready.`,
      reason: preparation?.reason,
      detail: preparation?.detail,
    };
  }
  if (server.status === 'failed' || preparation?.state === 'failed') {
    const reason = server.reason || preparation?.reason;
    return {
      state: 'failed',
      label: 'Failed',
      value: 'failed',
      sentence: preparationReasonSentence(reason),
      reason,
      detail: preparation?.detail,
    };
  }
  return undefined;
}

/**
 * The server's name inside its conversation, when it can be reconnected there: a
 * server the conversation's agent brings, listed for that conversation.
 */
export function reconnectableNamespace(server: McpServerDefinition | undefined): string {
  if (!server?.session_id || !server.id.startsWith('session_mcp_')) return '';
  return server.name;
}

/** Whether any server in ``servers`` is being prepared right now. */
export function anyServerPreparing(servers: readonly McpServerDefinition[] | undefined): boolean {
  return (servers ?? []).some((server) => mcpServerPreparation(server)?.state === 'preparing');
}
