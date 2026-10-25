import { z } from 'zod';
import type { ToolInvocation } from './domain.js';
import { forwardCompatibleEnum } from './schema-utils.js';

export const toolSubmissionSchema = z.object({
  state: forwardCompatibleEnum([
    'pending',
    'running',
    'succeeded',
    'failed',
    'denied',
    'cancelled',
  ]),
  output: z.unknown().optional(),
  error: z.string().optional(),
  completed_at: z.string().optional(),
  duration_ms: z.number().nullable().optional(),
});

export const toolExecutionTaskSchema = z.object({
  handle: z.string(),
  status: z.string(),
  activity: z.string(),
  updated_at: z.string(),
  accepted_at: z.string(),
  terminal_at: z.string().nullable(),
  cancellation_requested_at: z.string().nullable(),
  result_sha256: z.string().nullable(),
});

export const taskUpdateSchema = z.object({
  handle: z.string(),
  kind: z.string(),
  revision: z.number(),
  owner_session_id: z.string().optional(),
  invocation_id: z.string().optional(),
});

/** A late submission frame must not overwrite its operation's recorded outcome. */
export function mergeToolInvocation(
  previous: ToolInvocation | undefined,
  candidate: ToolInvocation,
): ToolInvocation {
  if (!previous) return candidate;
  const merged = {
    ...previous,
    ...candidate,
    presentation: candidate.presentation ?? previous.presentation,
  };
  if (candidate.execution_problem) return { ...merged, execution_task: candidate.execution_task };
  const older = previous.execution_task;
  const newer = candidate.execution_task;
  if (!older && !newer) return merged;
  const keepPrevious =
    older &&
    (!newer ||
      (older.handle === newer.handle &&
        ((older.terminal_at !== null && newer.terminal_at === null) ||
          Date.parse(older.updated_at) > Date.parse(newer.updated_at))));
  const execution = keepPrevious ? previous : candidate;
  return {
    ...merged,
    state: execution.state,
    output: execution.output,
    presentation: execution.presentation,
    error: execution.error,
    completed_at: execution.completed_at,
    duration_ms: execution.duration_ms,
    execution_task: execution.execution_task,
    execution_problem: execution.execution_problem,
    submission:
      candidate.submission ??
      (newer || !candidate.completed_at
        ? previous.submission
        : {
            state: candidate.state,
            output: candidate.output,
            error: candidate.error,
            completed_at: candidate.completed_at,
            duration_ms: candidate.duration_ms,
          }),
  };
}

/** An authorized task read can supersede an earlier submission-only stream row. */
export function isToolExecutionSnapshot(current: unknown, incoming: unknown): boolean {
  const candidate = incoming as ToolInvocation | undefined;
  const previous = current as ToolInvocation | undefined;
  if (!candidate?.execution_task && !candidate?.execution_problem) return false;
  return mergeToolInvocation(previous, candidate).execution_task === candidate.execution_task;
}
