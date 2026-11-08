import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Button } from '@/components/ui/button';
import { ManagedServiceHostFacts } from './managed-service-host-facts';
import { displayHostPath } from '@/lib/host-path-display';
import { StateView } from './primitives/state-view';
import { TechnicalDetails } from './technical-details';

/** Read actual capabilities from the same inspection/cache used by Services. */
export function InfrastructureHostInspection({ targetId }: { targetId: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const query = useQuery({
    queryKey: ['managed-service-catalog', settings.endpoint, targetId],
    queryFn: ({ signal }) => repository.managedServiceCatalog(targetId, signal),
    retry: false,
    staleTime: 30_000,
  });
  return (
    <section className="py-2" aria-label="Computer capabilities">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="truncate text-sm font-semibold">Computer capabilities</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? 'Inspecting…' : 'Inspect again'}
        </Button>
      </div>
      {query.error ? (
        <StateView
          className="mt-3"
          kind="error"
          size="row"
          title="Could not inspect this computer. Check its connection, then try again."
          action={{ label: 'Retry', onClick: () => void query.refetch() }}
        />
      ) : null}
      {query.error ? (
        <TechnicalDetails className="mt-2 text-xs" title="Inspection details">
          <pre className="clio-scrollbar max-h-48 overflow-auto whitespace-pre-wrap break-words">
            {query.error.message}
          </pre>
        </TechnicalDetails>
      ) : null}
      {query.data ? (
        <>
          <ManagedServiceHostFacts facts={query.data.facts} />
          <TechnicalDetails className="mt-3 text-xs" title="Computer identity & paths">
            {query.data.facts.hostname ? (
              <p className="mt-2 truncate text-xs text-muted-foreground">
                Computer: {query.data.facts.hostname}
              </p>
            ) : null}
            {query.data.facts.home ? (
              <p
                className="mt-1 truncate text-xs text-muted-foreground"
                title={displayHostPath(query.data.facts.home)}
              >
                Home: {displayHostPath(query.data.facts.home)}
              </p>
            ) : null}
          </TechnicalDetails>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {query.error ? 'Use Inspect again to retry.' : 'Reading this computer’s capabilities…'}
        </p>
      )}
    </section>
  );
}
