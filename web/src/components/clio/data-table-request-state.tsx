import { Skeleton } from '@/components/ui/skeleton';
import { LoadingFeedback, LoadingFailure } from './loading-feedback';
import { plural, t } from '@lingui/core/macro';

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
      <h3 className="text-sm font-medium">{t`Data table`}</h3>
      {error ? (
        <>
          <LoadingFailure title={t`Table unavailable`} detail={error} onRetry={retry} />
          {filterCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              {plural(filterCount, {
                one: 'This viewer has a filter of its own active, which may be the cause.',
                other: 'This viewer has # filters of its own active, which may be the cause.',
              })}{' '}
              <button
                className="font-medium text-link underline underline-offset-2"
                onClick={clearFilters}
                type="button"
              >
                {plural(filterCount, { one: 'Clear it', other: 'Clear them' })}
              </button>
              .
            </p>
          ) : null}
        </>
      ) : (
        <LoadingFeedback label={t`Loading data table`} variant="skeleton">
          <Skeleton className="h-48 w-full rounded-none" />
        </LoadingFeedback>
      )}
    </div>
  );
}
