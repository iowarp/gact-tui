import type { ToolInvocation } from '@clio/core/v3';
import { useContext } from 'react';
import { useToolJobs } from '@/hooks/use-job-snapshots';
import { useLiveStore } from '@/store/live-store';
import { cn } from '@/lib/utils';
import type { JobSnapshot } from '@/lib/job-snapshot';
import { JobCard } from './job-card';
import { PresentationNavigation } from './presentation-navigation';
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
  const open = useOpenToolRun(toolId);
  if (!jobs.length) return null;
  return (
    <div className={cn('grid min-w-0 gap-2', className)} data-slot="tool-job-cards">
      {jobs.map((job) => (
        <div
          className="min-w-0 rounded-lg border border-border/70 bg-card/40 px-3 py-2.5"
          key={job.operation_id}
        >
          <JobCard job={job} onOpen={open} />
        </div>
      ))}
    </div>
  );
}

/**
 * What opens the run a call started: its task's record when it ran as a task,
 * otherwise the call itself. Nothing when the surface cannot open either.
 */
export function useOpenToolRun(toolId: string | undefined): (() => void) | undefined {
  const navigation = useContext(PresentationNavigation);
  const live = useLiveStore((state) => (toolId ? state.entities.tools[toolId] : undefined));
  const tool: ToolInvocation | undefined = (toolId && navigation?.tools?.[toolId]) || live;
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