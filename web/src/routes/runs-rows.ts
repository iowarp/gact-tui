/** Run rows for the Runs page: tasks and flow runs, built from snapshots (pure). */
import type { RunState, Session, TaskSnapshot, TranscriptSnapshot, Workspace } from '@clio/core/v3';
import { operationalRunStateSchema } from '@clio/core/v3';
import { flowToolDescriptor } from '@/components/clio/flow-tool-presentation';
import { capitalize, vocab } from '@/lib/brand-vocabulary';
import { truncate } from '@/lib/format';
import { RUN_REASON_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import {
  workspaceLabels,
  workspaceLabelText,
  type WorkspaceDisplayLabel,
} from '@/lib/workspace-labels';

export type RunSource = 'agent_task' | 'mcp_task' | 'unknown' | 'flow';

export interface RunRow {
  progress?: Record<string, unknown>;
  taskKind?: string;
  assignment?: string;
  ownerSessionId?: string;
  cancelRequested?: boolean;
  cancellable?: boolean;
  handleId: string;
  taskId: string;
  label: string;
  state: RunState;
  reportedStatus: string;
  statusReason?: string;
  statusDetail?: string;
  source: RunSource;
  host: string;
  placement: string;
  workspaceLabel: string;
  workspaceLabelFields: WorkspaceDisplayLabel;
  workspaceId?: string;
  targetSessionId?: string;
  updatedAt: string;
  /** The task handle of a flow run, opened in its conversation with `?flow=`. */
  flowHandle?: string;
}

export const sourceLabels: Record<RunSource, string> = {
  agent_task: 'Agent',
  mcp_task: 'Tool',
  unknown: 'Unknown source',
  flow: 'Flow',
};

function conciseReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  try {
    const parsed = JSON.parse(reason) as Record<string, unknown>;
    const lastError = parsed.last_error;
    if (typeof lastError === 'string' && lastError.trim()) return lastError;
    const result = parsed.mcp_result;
    if (result && typeof result === 'object') {
      const protocolError = (result as Record<string, unknown>).protocol_error;
      if (typeof protocolError === 'string' && protocolError.trim()) return protocolError;
    }
  } catch {
    // Plain server-authored reasons are already suitable for display.
  }
  const embeddedReason = reason.match(
    /"(?:last_error|protocol_error|message)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
  );
  if (embeddedReason?.[1]) {
    try {
      return JSON.parse(`"${embeddedReason[1]}"`) as string;
    } catch {
      return embeddedReason[1];
    }
  }
  if (reason.trimStart().startsWith('{'))
    return 'The server reported structured failure details for this run.';
  return truncate(reason, RUN_REASON_TRUNCATE_CHARS);
}

export function buildRows(
  runs: readonly TaskSnapshot[],
  sessions: readonly Session[],
  workspaces: readonly Workspace[],
): RunRow[] {
  const labels = workspaceLabels(workspaces);
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  return runs.map((run) => {
    const targetSessionId = run.owner.session_id;
    const targetSession = targetSessionId ? sessionsById.get(targetSessionId) : undefined;
    const workspaceId = targetSession?.workspace_id;
    const workspaceLabelFields = workspaceId
      ? (labels.get(workspaceId) ?? {
          name: `${capitalize(vocab.workspace)} unavailable`,
          qualifiers: [],
        })
      : { name: `${capitalize(vocab.workspace)} unavailable`, qualifiers: [] };
    const statusDetail = ['failed', 'task_state_uncertain'].includes(run.status)
      ? run.progress.message || undefined
      : undefined;
    return {
      handleId: run.handle,
      taskKind: run.kind,
      progress: run.progress,
      assignment: run.description_missing
        ? 'Assignment description unavailable'
        : (run.description ?? undefined),
      ownerSessionId: run.owner.session_id,
      cancelRequested: Boolean(run.cancellation_requested_at),
      cancellable: run.supported_actions.includes('cancel'),
      taskId: run.handle,
      label: run.label || 'Unnamed task',
      state: taskState(run),
      reportedStatus: run.raw_status || run.status,
      statusReason: conciseReason(statusDetail),
      statusDetail,
      source: ['Session', 'Subagent'].includes(run.kind) ? 'agent_task' : 'mcp_task',
      host: run.backend?.server || '',
      placement: run.backend?.placement || 'local',
      workspaceLabel: workspaceLabelText(workspaceLabelFields),
      workspaceLabelFields,
      workspaceId,
      targetSessionId,
      updatedAt: run.updated_at,
    };
  });
}

function taskState(task: TaskSnapshot): RunState {
  if (task.terminal_at || task.status === 'task_state_uncertain')
    return operationalRunStateSchema.parse(task.status);
  if (task.cancellation_requested_at) return 'cancellation_requested';
  const activity: Record<string, string> = {
    busy: 'running',
    executing: 'running',
    cancelling: 'cancellation_requested',
    waiting_for_input: 'waiting_user',
    idle: 'yielded',
  };
  return operationalRunStateSchema.parse(activity[task.activity] ?? (task.activity || task.status));
}

// Pure indexing keeps transcript-derived flow identity deterministic and testable.
export function buildFlowRows(
  transcripts: readonly TranscriptSnapshot[],
  sessions: readonly Session[],
  workspaces: readonly Workspace[],
  tasks: readonly TaskSnapshot[] = [],
): RunRow[] {
  const labels = workspaceLabels(workspaces);
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  return transcripts.flatMap((transcript) =>
    Object.values(transcript.tools).flatMap((tool): RunRow[] => {
      const flow = flowToolDescriptor(tool);
      if (!flow) return [];
      const session = sessionsById.get(tool.session_id);
      const workspaceId = session?.workspace_id;
      const task = flow.handle ? tasks.find((row) => row.handle === flow.handle) : undefined;
      const state: RunState = flow.refusal
        ? 'failed'
        : task
          ? taskState(task)
          : flow.handle
            ? 'unknown'
            : tool.state === 'failed'
              ? 'failed'
              : 'queued';
      const workspaceLabelFields = workspaceId
        ? (labels.get(workspaceId) ?? {
            name: `${capitalize(vocab.workspace)} unavailable`,
            qualifiers: [],
          })
        : { name: `${capitalize(vocab.workspace)} unavailable`, qualifiers: [] };
      return [
        {
          handleId: flow.handle ?? tool.id,
          taskId: flow.handle ?? tool.id,
          taskKind: task?.kind,
          label: `${flow.label} run`,
          state,
          reportedStatus: task ? task.raw_status || task.status : (flow.refusal?.reason ?? state),
          statusReason: flow.refusal
            ? conciseReason(flow.refusal.message)
            : flow.handle && !task
              ? 'The flow task status is not loaded.'
              : !flow.handle
                ? 'The flow has not been accepted yet.'
                : undefined,
          source: 'flow',
          host: 'Flow',
          placement: flow.flow,
          workspaceLabel: workspaceLabelText(workspaceLabelFields),
          workspaceLabelFields,
          workspaceId,
          targetSessionId: tool.session_id,
          updatedAt:
            task?.updated_at || tool.completed_at || tool.started_at || session?.updated_at || '',
          flowHandle: flow.handle,
          cancellable: task?.supported_actions.includes('cancel'),
          ownerSessionId: task?.owner.session_id,
        },
      ];
    }),
  );
}
