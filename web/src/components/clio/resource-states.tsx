import { BoxIcon } from 'lucide-react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The loading state: skeleton rows that assistive technology announces as
 * `label`. Use it wherever a region waits on data, instead of bare "Loading…"
 * text (gact-tui#366). Worded status inside a control, such as a select
 * placeholder or a busy button, stays text.
 *
 * `line` is one short bar for inline spots: a tree row, a section header.
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
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={cn(variant === 'line' ? 'inline-flex items-center' : 'grid gap-2', className)}
      data-slot="resource-loading"
      role="status"
    >
      {variant === 'line' ? (
        <Skeleton aria-hidden="true" className="h-3 w-16" />
      ) : (
        <>
          <Skeleton aria-hidden="true" className="h-8 w-full" />
          <Skeleton aria-hidden="true" className="h-8 w-4/5" />
          <Skeleton aria-hidden="true" className="h-8 w-11/12" />
        </>
      )}
    </div>
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
