import type { ToolInvocation } from '@clio/core/v3';
import { useToolJobs } from '@/hooks/use-job-snapshots';
import { cn } from '@/lib/utils';
import type { JobSnapshot } from '@/lib/job-snapshot';
import { JobCard } from './job-card';

/**
 * Jobs drawn open in the conversation: a job is the work the person is waiting
 * on, so it never hides behind a result disclosure or a folded activity group.
 */
export function JobCards({ jobs, className }: { jobs: JobSnapshot[]; className?: string }) {
  if (!jobs.length) return null;
  return (
    <div className={cn('grid min-w-0 gap-2', className)} data-slot="tool-job-cards">
      {jobs.map((job) => (
        <div
          className="min-w-0 rounded-lg border border-border/70 bg-card/40 px-3 py-2.5"
          key={job.operation_id}
        >
          <JobCard job={job} />
        </div>
      ))}
    </div>
  );
}

/** The jobs a call started or described, under its row. Nothing renders for a call without one. */
export function ToolJobCards({ tool }: { tool: ToolInvocation }) {
  const jobs = useToolJobs(tool);
  return <JobCards className="mt-1.5 pl-6" jobs={jobs} />;
}
