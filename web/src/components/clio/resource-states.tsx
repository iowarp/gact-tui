import { BoxIcon } from 'lucide-react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingFeedback } from './loading-feedback';

/**
 * The loading state for a region that waits on data (gact-tui#366): the shared
 * `LoadingFeedback` status, so the wait is announced and its label is visible,
 * never shown only as a pulse. `block` adds skeleton rows that keep the region's
 * shape; `line` is the compact spinner and label for inline spots (a tree row,
 * a section header). Worded status inside a control, such as a select placeholder
 * or a busy button, stays text.
 */
export function ResourceLoading({
  label,
  className,
  variant = 'block',
}: {
  label: string;
  className?: string;
  variant?: 'block' | 'line';
}) {
  if (variant === 'line') return <LoadingFeedback className={className} label={label} />;
  return (
    <LoadingFeedback className={className} label={label} variant="skeleton">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-8 w-11/12" />
      </div>
    </LoadingFeedback>
  );
}

export function ResourceUnavailable({
  label,
  detail,
  icon: Icon = BoxIcon,
}: {
  label: string;
  detail?: string;
  icon?: typeof BoxIcon;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{label}</EmptyTitle>
        {detail ? <EmptyDescription>{detail}</EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  );
}
