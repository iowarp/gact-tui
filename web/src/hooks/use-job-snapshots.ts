import type { TaskSnapshot, ToolInvocation } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useContext, useMemo } from 'react';
import { PresentationNavigation } from '@/components/clio/presentation-navigation';
import { useRepository } from '@/hooks/use-repository';
import { jobFromTask, jobsFromToolOutput, latestJobs, type JobSnapshot } from '@/lib/job-snapshot';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';

/** How often a job card still in flight rereads its task's snapshot. */
const JOB_POLL_MS = 5_000;

export interface TaskJob {
  task: TaskSnapshot;
  job: JobSnapshot;
}

/** Jobs the agent's MCP tasks carry in their status, reread while `live`. */
export function useTaskJobs(live: boolean, enabled = true): TaskJob[] {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const query = useQuery({
    queryKey: queryKeys.key('tasks', settings.endpoint, 'jobs'),
    queryFn: ({ signal }) => repository.queryTasks({ kind: 'MCP', limit: 100 }, signal),
    enabled,
    refetchInterval: live ? JOB_POLL_MS : false,
  });
  return useMemo(
    () =>
      (query.data?.tasks ?? []).flatMap((task) => {
        const job = jobFromTask(task);
        return job ? [{ task, job }] : [];
      }),
    [query.data],
  );
}

export function jobInFlight(job: JobSnapshot): boolean {
  return job.phase !== 'ended' && job.phase !== 'planned';
}

/** The transcript row a call shows under: its outermost caller (a run_code script). */
function topLevelId(tools: Record<string, ToolInvocation>, call: ToolInvocation): string {
  let current = call;
  for (let depth = 0; current.parent_call_id && depth < 8; depth += 1) {
    const parent = tools[current.parent_call_id];
    if (!parent) return current.parent_call_id;
    current = parent;
  }
  return current.id;
}

interface SessionJobs {
  /** Each operation's latest snapshot from the conversation's call results. */
  jobs: JobSnapshot[];
  /** The row each operation's card shows under: the first call that carried it. */
  owners: Map<string, string>;
  /** Call ids and task handles in the conversation, by their row. */
  rowOf: Map<string, string>;
  /** Whether a task-backed call is still running (it can gain a job before its result). */
  taskRunning: boolean;
}

function sessionJobs(tools: Record<string, ToolInvocation>, sessionId: string): SessionJobs {
  const calls = Object.values(tools)
    .filter((call) => call.session_id === sessionId)
    .sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''));
  const owners = new Map<string, string>();
  const rowOf = new Map<string, string>();
  const found: JobSnapshot[] = [];
  let taskRunning = false;
  for (const call of calls) {
    const row = topLevelId(tools, call);
    rowOf.set(call.id, row);
    if (call.execution_task) {
      rowOf.set(call.execution_task.handle, row);
      if (call.state === 'running' || call.state === 'pending') taskRunning = true;
    }
    for (const job of jobsFromToolOutput(call.output)) {
      if (!owners.has(job.operation_id)) owners.set(job.operation_id, row);
      found.push(job);
    }
  }
  return { jobs: latestJobs(found), owners, rowOf, taskRunning };
}

/**
 * The jobs whose card shows under one transcript row: operations this row's call
 * (or a script's nested call) carried first, each at its latest revision across
 * the conversation's later results and the live snapshot of the task it runs as.
 */
export function useToolJobs(tool: ToolInvocation): JobSnapshot[] {
  const provided = useContext(PresentationNavigation)?.tools;
  const live = useLiveStore((state) => state.entities.tools);
  const tools = provided ?? live;
  const session = useMemo(() => sessionJobs(tools, tool.session_id), [tools, tool.session_id]);
  const following = session.taskRunning || session.jobs.some(jobInFlight);
  const taskJobs = useTaskJobs(following, following || session.jobs.length > 0);
  const toolId = tool.id;
  return useMemo(() => {
    const owners = new Map(session.owners);
    const fromTasks: JobSnapshot[] = [];
    for (const { task, job } of taskJobs) {
      const row =
        session.rowOf.get(task.invocation_id) ??
        session.rowOf.get(task.handle) ??
        (owners.has(job.operation_id) ? owners.get(job.operation_id) : undefined);
      if (!row) continue;
      if (!owners.has(job.operation_id)) owners.set(job.operation_id, row);
      fromTasks.push(job);
    }
    return latestJobs([...session.jobs, ...fromTasks]).filter(
      (job) => owners.get(job.operation_id) === toolId,
    );
  }, [session, taskJobs, toolId]);
}

/**
 * Every job the person can see: the live snapshots of the agent's MCP tasks and
 * the latest results the loaded conversations carry, one per operation.
 */
export function useAllJobs(): JobSnapshot[] {
  const tools = useLiveStore((state) => state.entities.tools);
  const fromCalls = useMemo(
    () => latestJobs(Object.values(tools).flatMap((call) => jobsFromToolOutput(call.output))),
    [tools],
  );
  const taskJobs = useTaskJobs(true);
  return useMemo(
    () =>
      latestJobs([...fromCalls, ...taskJobs.map(({ job }) => job)]).sort((a, b) =>
        (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
      ),
    [fromCalls, taskJobs],
  );
}
