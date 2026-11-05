import { useQuery } from '@tanstack/react-query';
import { DashboardView } from '@/components/clio/dashboard-view';
import { useRepository } from '@/hooks/use-repository';

/** One captured dashboard, rendered as the live viewer renders it, read-only. */
export function ArchiveDashboard({
  sessionId,
  artifactId,
  title,
}: {
  sessionId: string;
  artifactId: string;
  title: string;
}) {
  const repository = useRepository();
  const report = useQuery({
    queryKey: ['archive-dashboard', sessionId, artifactId],
    queryFn: () => repository.dashboard(sessionId, artifactId),
  });
  return (
    <section className="my-5" aria-label={`Dashboard: ${title}`}>
      {report.data ? (
        <DashboardView report={report.data} artifactId={artifactId} offline />
      ) : report.isError ? (
        <p className="rounded-lg border p-4">
          The dashboard {title} was not captured. Its files remain in Included files.
        </p>
      ) : null}
    </section>
  );
}
