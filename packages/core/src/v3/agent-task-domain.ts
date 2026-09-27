import { z } from 'zod';

/**
 * One agent task the service's task registry holds for a session: a delegated
 * child agent, a spawned child session, or a standing watcher (SPOTTER).
 *
 * Served by `GET /v1/sessions/{sid}/agent-tasks`. Unlike the live
 * `subagent.upserted` projection, this read covers every task the registry
 * still knows, including ones armed before the client connected and ones no
 * transcript message mentions.
 */
export interface AgentTaskRecord {
  task_id: string;
  parent_session_id: string;
  child_session_id: string;
  parent_turn_id: string;
  expert_id: string;
  blueprint_id: string;
  run_index: number;
  run_label: string;
  /** Registry lifecycle: queued | running | completed | failed | cancelled | interrupted. */
  status: string;
  /** Finer live state while running (e.g. `waiting` for a standing watcher between checks). */
  live_state: string;
  error_reason: string;
  created_at: string;
  updated_at: string;
  answer_excerpt: string;
}

export const agentTaskRecordSchema = z
  .object({
    task_id: z.string(),
    parent_session_id: z.string().default(''),
    child_session_id: z.string().default(''),
    parent_turn_id: z.string().nullish(),
    agent_ref: z.record(z.unknown()).nullish(),
    run_index: z.number().int().nonnegative().nullish(),
    run_label: z.string().nullish(),
    status: z.string().nullish(),
    live_state: z.string().nullish(),
    error_reason: z.string().nullish(),
    created_at: z.string().nullish(),
    updated_at: z.string().nullish(),
    result: z.record(z.unknown()).nullish(),
  })
  .passthrough()
  .transform(
    (task): AgentTaskRecord => ({
      task_id: task.task_id,
      parent_session_id: task.parent_session_id,
      child_session_id: task.child_session_id,
      parent_turn_id: task.parent_turn_id ?? '',
      expert_id: typeof task.agent_ref?.expert_id === 'string' ? task.agent_ref.expert_id : '',
      blueprint_id:
        typeof task.agent_ref?.blueprint_id === 'string' ? task.agent_ref.blueprint_id : '',
      run_index: task.run_index ?? 0,
      run_label: task.run_label ?? '',
      status: task.status ?? '',
      live_state: task.live_state ?? '',
      error_reason: task.error_reason ?? '',
      created_at: task.created_at ?? '',
      updated_at: task.updated_at ?? '',
      answer_excerpt:
        typeof task.result?.answer_excerpt === 'string' ? task.result.answer_excerpt : '',
    }),
  );
