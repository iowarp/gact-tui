import type { HttpTransport } from './transport.js';

type SessionAgentTaskTransport = Pick<HttpTransport, 'get'>;

/** One asynchronous unit reported by a session's agent-task projection. */
export interface SessionAgentTask {
  id: string;
  status: string;
  [key: string]: unknown;
}

/** Response from the session-scoped agent-task read. */
export interface SessionAgentTasksResult {
  tasks: SessionAgentTask[];
}

/** Read all agent tasks currently projected for a session. */
export function fetchSessionAgentTasks(
  client: SessionAgentTaskTransport,
  sessionId: string,
): Promise<SessionAgentTasksResult> {
  return client.get(`/v1/sessions/${encodeURIComponent(sessionId)}/agent-tasks`);
}
