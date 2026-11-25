import { t } from '@lingui/core/macro';
import { useAllJobs } from '@/hooks/use-job-snapshots';
import { ListGroupLabel } from './primitives/list-row';
import { JobCard } from './job-card';

/**
 * The scheduler jobs the agent's tools started, each as the same card the
 * submit question and the transcript draw. Nothing renders until a job exists.
 */
export function InfrastructureJobs() {
  const jobs = useAllJobs();
  if (!jobs.length) return null;
  return (
    <section
      aria-label={t`Jobs`}
      className="flex min-w-0 flex-col pt-2"
      data-slot="infrastructure-jobs"
    >
      <ListGroupLabel wrap>{t`Jobs`}</ListGroupLabel>
      <ul className="grid min-w-0 gap-2">
        {jobs.map((job) => (
          <li
            className="min-w-0 rounded-lg border border-border/70 bg-card/40 px-3 py-2.5"
            key={job.operation_id}
          >
            <JobCard job={job} />
          </li>
        ))}
      </ul>
    </section>
  );
}
