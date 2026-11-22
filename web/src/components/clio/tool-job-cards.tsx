import type { ToolInvocation } from '@clio/core/v3';
import { useToolJobs } from '@/hooks/use-job-snapshots';
import { JobCard } from './job-card';

/**
 * The jobs a call started or described, drawn under its row and kept open: a
 * job is the work the person is waiting on, so it never hides behind a result
 * disclosure. Nothing renders for a call that carries no job.
 */
export function ToolJobCards({ tool }: { tool: ToolInvocation }) {
  const jobs = useToolJobs(tool);
  if (!jobs.length) return null;
  return (
    <div className="mt-1.5 grid min-w-0 gap-2 pl-6" data-slot="tool-job-cards">
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
