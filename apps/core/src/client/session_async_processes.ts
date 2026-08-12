import type { HttpTransport } from './transport.js';

type SessionAsyncProcessTransport = Pick<HttpTransport, 'get'>;

/** One async process reported by a session's async-processes projection
 *  (clio-agent#1205): a spawned agent OR a durable MCP/relay task record,
 *  unioned by the server with a `kind` discriminator so the UI can route
 *  each row differently — a `kind: 'agent'` row pushes to center focus
 *  (SessionView's `openChildByHandle`); a `kind: 'mcp-task'` row opens the
 *  read-only right-column peek (`McpTaskPeekView`). Fields beyond the
 *  discriminator trio (kind/id/title) vary by kind — an agent row carries
 *  the full AgentTask projection (agent_ref, child_session_id, ...), an
 *  mcp-task row carries the full durable TaskRecord wire projection
 *  (key, tool, backend, status, updated_at, ...) — so this stays a loose
 *  index signature rather than re-declaring either shape. */
export interface SessionAsyncProcess {
  kind: 'agent' | 'mcp-task';
  id: string;
  title: string;
  status: string;
  live_state?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** Response from the session-scoped async-processes read. */
export interface SessionAsyncProcessesResult {
  processes: SessionAsyncProcess[];
}

/** Read every async process (agent OR durable MCP task) currently projected
 *  for a session — the tray's single fetch. */
export function fetchSessionAsyncProcesses(
  client: SessionAsyncProcessTransport,
  sessionId: string,
): Promise<SessionAsyncProcessesResult> {
  return client.get(`/v1/sessions/${encodeURIComponent(sessionId)}/async-processes`);
}
