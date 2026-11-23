import type { TaskSnapshot, ToolInvocation } from '@clio/core/v3';
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { PresentationNavigation } from '@/components/clio/presentation-navigation';
import { useRepository } from '@/hooks/use-repository';
import {
  jobFromResource,
  jobFromTask,
  jobResourceUri,
  jobsFromToolOutput,
  latestJobs,
  type JobSnapshot,
} from '@/lib/job-snapshot';
import { queryKeys } from '@/lib/query-keys';
import { serverResourceQueryKey } from '@/lib/server-resource';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';

/** How often a job card still in flight rereads its task's snapshot. */
const JOB_POLL_MS = 5_000;
/**
 * How often a job whose task has ended rereads its card when no update reaches
 * it, as for a conversation that is not open. An open one hears each update.
 */
const JOB_RESOURCE_POLL_MS = 30_000;

export interface TaskJob {
  task: TaskSnapshot;
  job: JobSnapshot;
}

/** A task by its conversation and handle, the address its latest status is read at. */
interface TaskRef {
  sessionId: string;
  handle: string;
}

function refKey(ref: TaskRef): string {
  return `${ref.sessionId}\u0000${ref.handle}`;
}

/** The open tasks the job list has seen, kept so a job that ended stays listed. */
const FOLLOWED_STORAGE_KEY = 'clio.jobs.followed.v1';
const FOLLOWED_LIMIT = 20;

function readFollowed(): TaskRef[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(FOLLOWED_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (entry): entry is TaskRef =>
          typeof entry?.sessionId === 'string' && typeof entry?.handle === 'string',
      )
      .slice(-FOLLOWED_LIMIT);
  } catch {
    return [];
  }
}

function writeFollowed(refs: TaskRef[]): void {
  try {
    localStorage.setItem(FOLLOWED_STORAGE_KEY, JSON.stringify(refs.slice(-FOLLOWED_LIMIT)));
  } catch {
    // Storage may be full or disabled; the list still follows jobs for this page.
  }
}

function taskJobs(tasks: Iterable<TaskSnapshot | null | undefined>): TaskJob[] {
  const found: TaskJob[] = [];
  for (const task of tasks) {
    const job = task ? jobFromTask(task) : null;
    if (task && job) found.push({ task, job });
  }
  return found;
}

function combineTaskJobs(results: UseQueryResult<TaskSnapshot | null>[]): TaskJob[] {
  return taskJobs(results.map((result) => result.data));
}

/** How many of the newest MCP tasks the job lists read. */
const RECENT_TASKS = 50;

/**
 * Jobs the agent's newest MCP tasks carry in their status, reread while `live`.
 * Reading the newest rather than only the open ones keeps a job whose task
 * settled while no list was mounted, such as a service that became ready.
 */
function useRecentTaskJobs(live: boolean, enabled = true): TaskJob[] {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const query = useQuery({
    queryKey: queryKeys.key('tasks', settings.endpoint, 'jobs', 'recent'),
    queryFn: ({ signal }) =>
      repository.queryTasks({ kind: 'MCP', order: 'newest', limit: RECENT_TASKS }, signal),
    enabled,
    refetchInterval: live ? JOB_POLL_MS : false,
  });
  return useMemo(() => taskJobs(query.data?.tasks ?? []), [query.data]);
}

/**
 * Jobs the newest MCP tasks of one conversation carry, reread while `live`. A
 * task names the call it runs for, so its card finds its row even when the
 * call's record does not carry the task.
 */
function useSessionTaskJobs(sessionId: string | undefined, live: boolean, enabled: boolean) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const query = useQuery({
    queryKey: queryKeys.key('tasks', settings.endpoint, 'jobs', 'session', sessionId ?? ''),
    queryFn: ({ signal }) =>
      repository.sessionTasks(sessionId!, { kind: 'MCP', limit: RECENT_TASKS }, signal),
    enabled: enabled && Boolean(sessionId),
    // An open task can still gain or change its job, even when no call shows it running.
    refetchInterval: (query) =>
      live || query.state.data?.tasks.some((task) => !task.terminal_at) ? JOB_POLL_MS : false,
  });
  return useMemo(() => taskJobs(query.data?.tasks ?? []), [query.data]);
}

/** Each task's latest status by handle, reread until the task settles. */
function useTaskRefJobs(refs: TaskRef[]): TaskJob[] {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQueries({
    queries: refs.map((ref) => ({
      queryKey: queryKeys.key('tasks', settings.endpoint, 'job', ref.sessionId, ref.handle),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        repository.sessionTask(ref.sessionId, ref.handle, signal),
      refetchInterval: (query: { state: { data: TaskSnapshot | null | undefined } }) =>
        query.state.data === null || query.state.data?.terminal_at ? false : JOB_POLL_MS,
      staleTime: (query: { state: { data: TaskSnapshot | null | undefined } }) =>
        query.state.data === null || query.state.data?.terminal_at ? Infinity : 0,
    })),
    combine: combineTaskJobs,
  });
}

export function jobInFlight(job: JobSnapshot): boolean {
  return job.phase !== 'ended' && job.phase !== 'planned';
}

/** A job's card on the server that runs it, read in the conversation that mounts it. */
interface JobResourceRef {
  sessionId: string;
  namespace: string;
  uri: string;
}

function resourceKey(ref: JobResourceRef): string {
  return `${ref.sessionId}\u0000${ref.namespace}\u0000${ref.uri}`;
}

/**
 * The jobs still in flight whose task has ended, such as a service whose task
 * completed once it was ready. The task stops changing then, so the card is
 * followed on its server instead.
 */
function jobResourceRefs(found: TaskJob[]): JobResourceRef[] {
  const refs = new Map<string, JobResourceRef>();
  for (const { task, job } of found) {
    const namespace = task.backend?.server;
    if (!task.terminal_at || !namespace || !jobInFlight(job)) continue;
    const ref = {
      sessionId: task.owner.session_id,
      namespace,
      uri: jobResourceUri(job),
    };
    refs.set(resourceKey(ref), ref);
  }
  return [...refs.values()];
}

function combineResourceJobs(
  results: UseQueryResult<JobSnapshot | null>[],
): (JobSnapshot | null)[] {
  return results.map((result) => result.data ?? null);
}

/** Holds one watch per resource while `refs` lists it, and lets each go after. */
function useWatchedResources(refs: JobResourceRef[]): void {
  const repository = useRepository();
  const holder = useId();
  const held = useRef(new Map<string, JobResourceRef>());
  const wanted = refs.map(resourceKey).join('\u0001');
  const latest = useRef(refs);
  latest.current = refs;
  useEffect(() => {
    const next = new Map(latest.current.map((ref) => [resourceKey(ref), ref]));
    const change = (ref: JobResourceRef, watching: boolean) =>
      void repository
        .watchSessionServerResource(ref.sessionId, ref.namespace, ref.uri, { holder, watching })
        .catch(() => undefined);
    for (const [key, ref] of next) if (!held.current.has(key)) change(ref, true);
    for (const [key, ref] of held.current) if (!next.has(key)) change(ref, false);
    held.current = next;
  }, [repository, holder, wanted]);
  useEffect(
    () => () => {
      for (const ref of held.current.values()) {
        void repository
          .watchSessionServerResource(ref.sessionId, ref.namespace, ref.uri, {
            holder,
            watching: false,
          })
          .catch(() => undefined);
      }
      held.current = new Map();
    },
    [repository, holder],
  );
}

/**
 * The newest cards of the jobs whose task ended while the job ran on: read
 * from the job's resource, reread on each update the server announces and
 * slowly without one, until the card says the job ended.
 */
function useJobResources(found: TaskJob[]): JobSnapshot[] {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const refs = useMemo(() => jobResourceRefs(found), [found]);
  const jobs = useQueries({
    queries: refs.map((ref) => ({
      queryKey: serverResourceQueryKey(settings.endpoint, ref.sessionId, ref.namespace, ref.uri),
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        jobFromResource(
          await repository.readSessionServerResource(ref.sessionId, ref.namespace, ref.uri, signal),
        ),
      refetchInterval: (query: { state: { data: JobSnapshot | null | undefined } }) =>
        query.state.data && !jobInFlight(query.state.data) ? false : JOB_RESOURCE_POLL_MS,
      retry: false,
    })),
    combine: combineResourceJobs,
  });
  useWatchedResources(refs.filter((_, index) => !jobs[index] || jobInFlight(jobs[index]!)));
  return useMemo(() => latestJobs(jobs), [jobs]);
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
  /** The tasks the conversation's calls run as, each read by handle for its job. */
  taskRefs: TaskRef[];
  /** Whether a task-backed call is still running (it can gain a job before its result). */
  taskRunning: boolean;
}

function sessionJobs(
  tools: Record<string, ToolInvocation>,
  sessionId: string | undefined,
): SessionJobs {
  const calls = Object.values(tools)
    .filter((call) => sessionId && call.session_id === sessionId)
    .sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''));
  const owners = new Map<string, string>();
  const rowOf = new Map<string, string>();
  const found: JobSnapshot[] = [];
  const taskRefs: TaskRef[] = [];
  let taskRunning = false;
  for (const call of calls) {
    const row = topLevelId(tools, call);
    rowOf.set(call.id, row);
    if (call.execution_task && sessionId) {
      taskRefs.push({ sessionId, handle: call.execution_task.handle });
      rowOf.set(call.execution_task.handle, row);
      if (call.state === 'running' || call.state === 'pending') taskRunning = true;
    }
    for (const job of jobsFromToolOutput(call.output)) {
      if (!owners.has(job.operation_id)) owners.set(job.operation_id, row);
      found.push(job);
    }
  }
  return { jobs: latestJobs(found), owners, rowOf, taskRefs, taskRunning };
}

/**
 * A conversation's jobs by the transcript row their card shows under: each
 * operation goes to the row whose call (or a script's nested call) carried it
 * first, at its latest revision across later results and the live snapshot of
 * the task it runs as.
 */
export function useSessionJobRows(sessionId: string | undefined): Map<string, JobSnapshot[]> {
  const provided = useContext(PresentationNavigation)?.tools;
  const live = useLiveStore((state) => state.entities.tools);
  const tools = provided ?? live;
  const session = useMemo(() => sessionJobs(tools, sessionId), [tools, sessionId]);
  const following = session.taskRunning || session.jobs.some(jobInFlight);
  const byHandle = useTaskRefJobs(session.taskRefs);
  const open = useSessionTaskJobs(sessionId, following, session.rowOf.size > 0);
  const fromResources = useJobResources(useMemo(() => [...byHandle, ...open], [byHandle, open]));
  return useMemo(() => {
    const owners = new Map(session.owners);
    const fromTasks: JobSnapshot[] = [];
    for (const { task, job } of [...byHandle, ...open]) {
      const row =
        session.rowOf.get(task.invocation_id) ??
        session.rowOf.get(task.handle) ??
        (owners.has(job.operation_id) ? owners.get(job.operation_id) : undefined);
      if (!row) continue;
      if (!owners.has(job.operation_id)) owners.set(job.operation_id, row);
      fromTasks.push(job);
    }
    const rows = new Map<string, JobSnapshot[]>();
    for (const job of latestJobs([...session.jobs, ...fromTasks, ...fromResources])) {
      const row = owners.get(job.operation_id);
      // A planned job's card belongs to the question that asks to submit it.
      if (row && job.phase !== 'planned') rows.set(row, [...(rows.get(row) ?? []), job]);
    }
    return rows;
  }, [session, byHandle, open, fromResources]);
}

const NO_JOBS: JobSnapshot[] = [];

/** The jobs whose card shows under one transcript row. */
export function useToolJobs(tool: ToolInvocation): JobSnapshot[] {
  return useSessionJobRows(tool.session_id).get(tool.id) ?? NO_JOBS;
}
/**
 * Every job the person can see: the latest results the loaded conversations
 * carry and the live snapshots of the agent's MCP tasks, one per operation. An
 * open task stays followed by handle after it settles, so its card ends.
 */
export function useAllJobs(): JobSnapshot[] {
  const tools = useLiveStore((state) => state.entities.tools);
  const fromCalls = useMemo(
    () => latestJobs(Object.values(tools).flatMap((call) => jobsFromToolOutput(call.output))),
    [tools],
  );
  const open = useRecentTaskJobs(true);
  const [followed, setFollowed] = useState<TaskRef[]>(readFollowed);
  const known = new Set(followed.map(refKey));
  const unseen = open
    .map(({ task }) => ({ sessionId: task.owner.session_id, handle: task.handle }))
    .filter((ref) => !known.has(refKey(ref)));
  if (unseen.length) setFollowed([...followed, ...unseen].slice(-FOLLOWED_LIMIT));
  useEffect(() => writeFollowed(followed), [followed]);
  const refs = useMemo(() => {
    const all = new Map(followed.map((ref) => [refKey(ref), ref]));
    for (const call of Object.values(tools)) {
      if (!call.execution_task || !call.session_id) continue;
      const ref = { sessionId: call.session_id, handle: call.execution_task.handle };
      all.set(refKey(ref), ref);
    }
    return [...all.values()];
  }, [followed, tools]);
  const byHandle = useTaskRefJobs(refs);
  const fromResources = useJobResources(useMemo(() => [...byHandle, ...open], [byHandle, open]));
  return useMemo(
    () =>
      latestJobs([
        ...fromCalls,
        ...[...byHandle, ...open].map(({ job }) => job),
        ...fromResources,
      ]).sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')),
    [fromCalls, byHandle, open, fromResources],
  );
}
