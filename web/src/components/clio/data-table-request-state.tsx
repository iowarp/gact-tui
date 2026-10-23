import { Skeleton } from '@/components/ui/skeleton';
import { LoadingFeedback, LoadingFailure } from './loading-feedback';

/** Initial table layout or an actionable query failure, preserving viewer filter recovery. */
export function DataTableRequestState({
  error,
  retry,
  filterCount,
  clearFilters,
}: {
  error?: string;
  retry?: () => void;
  filterCount: number;
  clearFilters: () => void;
}) {
  return (
    <div className="min-w-0 space-y-2" role="group">
      <h3 className="text-sm font-medium">Data table</h3>
      {error ? (
        <>
          <LoadingFailure title="Table unavailable" detail={error} onRetry={retry} />
          {filterCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              This viewer has {filterCount === 1 ? 'a filter' : `${filterCount} filters`} of its own
              active, which may be the cause.{' '}
              <button
                className="font-medium text-primary underline underline-offset-2"
                onClick={clearFilters}
                type="button"
              >
                Clear {filterCount === 1 ? 'it' : 'them'}
              </button>
              .
            </p>
          ) : null}
        </>
      ) : (
        <LoadingFeedback label="Loading data table" variant="skeleton">
          <Skeleton className="h-48 w-full rounded-none" />
        </LoadingFeedback>
      )}
    </div>
  );
}
