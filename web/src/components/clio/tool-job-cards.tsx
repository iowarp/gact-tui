import type { ToolInvocation } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import { useToolJobs } from '@/hooks/use-job-snapshots';
import { useRepository } from '@/hooks/use-repository';
import { useLiveStore } from '@/store/live-store';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import type { JobSnapshot } from '@/lib/job-snapshot';
import { useConnectionSettings } from '@/providers/connection-provider';
import { JobCard } from './job-card';
import { PresentationNavigation } from './presentation-navigation';
import { RunRetry } from './run-retry';
import { getToolActionLabel } from './tool-presentation';

/**
 * Jobs drawn open in the conversation: a job is the work the person is waiting
 * on, so it never hides behind a result disclosure or a folded activity group.
 * Given the call that started them, each card opens that call's run.
 */
export function JobCards({
  jobs,
  className,
  toolId,
}: {
  jobs: JobSnapshot[];
  className?: string;
  toolId?: string;
}) {
  const tool = useToolCall(toolId);
  const open = useOpenToolRun(tool);
  const task = useToolTask(tool, jobs.length > 0);
  if (!jobs.length) return null;
  return (
    <div className={cn('grid min-w-0 gap-2', className)} data-slot="tool-job-cards">
      {jobs.map((job) => (
        <div
          className="min-w-0 rounded-lg border border-border/70 bg-card/40 px-3 py-2.5"
          key={job.operation_id}
        >
          <JobCard
            actions={
              task && tool ? (
                <RunRetry
                  look="icon"
                  row={{
                    // A job that failed or ran out of time is retried as its run.
                    state: jobFailed(job) ? 'failed' : 'running',
                    ownerSessionId: task.owner.session_id,
                    handleId: task.handle,
                    label: getToolActionLabel(tool),
                    task,
                  }}
                />
              ) : undefined
            }
            job={job}
            onOpen={open}
          />
        </div>
      ))}
    </div>
  );
}

function jobFailed(job: JobSnapshot): boolean {
  return job.phase === 'ended' && (job.outcome === 'failed' || job.outcome === 'timed_out');
}

/** The call a transcript row shows, from the surface that draws it or the live store. */
function useToolCall(toolId: string | undefined): ToolInvocation | undefined {
  const navigation = useContext(PresentationNavigation);
  const live = useLiveStore((state) => (toolId ? state.entities.tools[toolId] : undefined));
  return (toolId && navigation?.tools?.[toolId]) || live;
}

/**
 * The task a call ran as, from the snapshot its job cards already follow (the
 * same query), so a failed job's card offers Retry when its run can restart.
 */
function useToolTask(tool: ToolInvocation | undefined, enabled: boolean) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const sessionId = tool?.session_id ?? '';
  const handle = tool?.execution_task?.handle ?? '';
  return useQuery({
    queryKey: queryKeys.key('tasks', settings.endpoint, 'job', sessionId, handle),
    queryFn: ({ signal }) => repository.sessionTask(sessionId, handle, signal),
    enabled: enabled && Boolean(sessionId && handle),
    staleTime: Infinity,
  }).data;
}

/**
 * What opens the run a call started: its task's record when it ran as a task,
 * otherwise the call itself. Nothing when the surface cannot open either.
 */
function useOpenToolRun(tool: ToolInvocation | undefined): (() => void) | undefined {
  const navigation = useContext(PresentationNavigation);
  if (!tool) return undefined;
  const label = getToolActionLabel(tool);
  const handle = tool.execution_task?.handle;
  if (handle && navigation?.onOpenRun)
    return () => navigation.onOpenRun?.(handle, label, tool.session_id || undefined);
  if (navigation?.onOpenToolCall) return () => navigation.onOpenToolCall?.(tool, label);
  return undefined;
}

/** The jobs a call started or described, under its row. Nothing renders for a call without one. */
export function ToolJobCards({ tool }: { tool: ToolInvocation }) {
  const jobs = useToolJobs(tool);
  return <JobCards className="mt-1.5 pl-6" jobs={jobs} toolId={tool.id} />;
}
