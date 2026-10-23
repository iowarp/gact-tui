import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** Request-owned feedback: layout placeholders, a quiet refresh, or a blocking local cover. */
export function LoadingFeedback({
  label,
  variant = 'inline',
  children,
  className,
  progress,
}: {
  label: string;
  variant?: 'inline' | 'skeleton' | 'overlay';
  children?: ReactNode;
  className?: string;
  progress?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={cn(
        variant === 'overlay'
          ? 'absolute inset-0 z-10 grid place-content-center gap-3 rounded-[inherit] bg-background/75 p-4 text-center backdrop-blur-xs'
          : variant === 'skeleton'
            ? 'grid gap-3'
            : 'flex items-center gap-2 text-xs text-muted-foreground',
        className,
      )}
    >
      <span
        className={cn(
          'flex items-center gap-2 text-xs text-muted-foreground',
          variant === 'overlay' && 'justify-center',
        )}
      >
        {progress === undefined ? (
          <Spinner
            aria-hidden="true"
            role="presentation"
            className="size-3.5 motion-reduce:animate-none"
          />
        ) : null}
        {label}
      </span>
      {progress !== undefined ? (
        <Progress aria-label={label} value={progress} className="min-w-32" />
      ) : null}
      {variant === 'skeleton' ? (
        <div aria-hidden="true">
          {children ?? <Skeleton className="h-36 w-full motion-reduce:animate-none" />}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/** A failed request is actionable and distinct from an empty result. */
export function LoadingFailure({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
}) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{detail}</p>
        {onRetry ? (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
