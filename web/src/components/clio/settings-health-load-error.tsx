import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { plainReason } from './settings-health-reason';

/**
 * A load failure on the affected row or under its group label: what failed, a
 * plain-language reason and an inline Retry. The technical message stays in the hover title.
 */
export function SettingsLoadError({
  title,
  error,
  onRetry,
  retrying = false,
  className,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const technical = error instanceof Error ? error.message : undefined;
  return (
    <div
      className={cn('flex min-h-7 min-w-0 items-center gap-2 py-1 text-[0.71875rem]', className)}
      role="alert"
    >
      <span className="flex min-w-0 items-baseline gap-1.5" title={technical}>
        <span className="shrink-0 font-medium text-destructive">{title}</span>
        <span className="min-w-0 truncate text-destructive/90">{plainReason(error)}</span>
      </span>
      {onRetry ? (
        <Button
          className="h-auto shrink-0 px-0 text-[0.71875rem]"
          disabled={retrying}
          onClick={onRetry}
          size="xs"
          type="button"
          variant="link"
        >
          Retry
        </Button>
      ) : null}
    </div>
  );
}
