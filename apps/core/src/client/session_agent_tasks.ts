import type { HttpTransport } from './transport.js';

type SessionAgentTaskTransport = Pick<HttpTransport, 'get'>;

/** The expert path attached to a delegated agent task. */
export interface SessionAgentTaskRef {
  expert_id?: string;
  requesting_expert_id?: string;
  [key: string]: unknown;
}

/** One asynchronous unit reported by a session's agent-task projection. */
export interface SessionAgentTask {
  task_id: string;
  /** Compatibility with older projections that named the task id `id`. */
  id?: string;
  status: string;
  live_state?: string;
  run_label?: string;
  agent_ref?: SessionAgentTaskRef;
  depth?: number;
  host?: string;
  placement?: string;
  parent_session_id?: string;
  child_session_id?: string;
  created_at?: string;
  completed_at?: string;
  updated_at?: string;
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
