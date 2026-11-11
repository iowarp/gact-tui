import type { AsyncProcess, RunState, SubagentRun } from '@clio/core/v3';
import { operationalRunStateSchema } from '@clio/core/v3';
import { conciseReason, type RunRow } from '@/routes/runs-rows';
import { flowLabel } from './flow-tool-presentation';
import { runGroup, type RunGroup } from './run-presentation';
import { taskActivity, type TaskActivity } from './task-activity';

/** One run of this conversation: the shared run row plus the records its actions need. */
export interface RailRun {
  row: RunRow;
  entry: TaskActivity;
  /** Settled runs can no longer be stopped. */
  active: boolean;
  /** A failed run the server can start again. */
  retryable: boolean;
}

const SETTLED = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'stopped']);
const GROUP_ORDER: readonly RunGroup[] = ['needs-you', 'running', 'queued', 'earlier'];

function railState(value: string): RunState {
  const parsed = operationalRunStateSchema.safeParse(value);
  return parsed.success ? parsed.data : 'task_state_uncertain';
}

/**
 * This conversation's tasks and child agents as Runs-page rows (pure). Needs-you
 * runs come first, then running, queued and earlier ones, each in recorded order.
 */
export function railRuns(
  processes: readonly AsyncProcess[],
  subagents: readonly SubagentRun[] = [],
): RailRun[] {
  const runs = taskActivity(processes, subagents).map((entry): RailRun => {
    const task = entry.process;
    const child = entry.subagent;
    const reported = task ? (task.effective_status ?? task.live_state) : child!.state;
    const active = !SETTLED.has(reported);
    const cancelRequested = Boolean(task?.cancel_requested) && active;
    const state = cancelRequested ? 'cancellation_requested' : railState(reported);
    const kind = task?.task_kind ?? (task?.kind === 'agent' || child ? 'Subagent' : 'MCP');
    const failure = state === 'failed' ? task?.error_reason || child?.summary : undefined;
    return {
      entry,
      active,
      retryable: state === 'failed' && Boolean(task?.supported_actions?.includes('restart')),
      row: {
        handleId: entry.key,
        taskId: entry.key,
        taskKind: kind,
        label: task?.flow
          ? `${flowLabel(task.flow.id)} run`
          : task?.title || child?.title || 'Unnamed task',
        assignment: task?.description || child?.task,
        progress: task?.progress,
        cancelRequested,
        cancellable: active && Boolean(task?.supported_actions?.includes('cancel')),
        state,
        reportedStatus: task?.raw_status || task?.status || reported,
        statusReason: conciseReason(failure),
        statusDetail: failure,
        source: task?.flow
          ? 'flow'
          : ['Subagent', 'Session'].includes(kind)
            ? 'agent_task'
            : 'mcp_task',
        host: task?.host ?? '',
        placement: task?.placement ?? 'local',
        workspaceLabel: '',
        workspaceLabelFields: { name: '', qualifiers: [] },
        updatedAt: task?.updated_at ?? task?.created_at ?? '',
        elapsedMs: child?.duration_ms,
        flowHandle: task?.flow ? entry.key : undefined,
      },
    };
  });
  return GROUP_ORDER.flatMap((group) => runs.filter((run) => runGroup(run.row.state) === group));
}
