import type { MouseEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { cn } from '@/lib/utils';
import { ClioRelativeTime } from './relative-time';
import { t } from '@lingui/core/macro';

/** One summary fact links to its full view without embedding that view's card. */
export function SessionSummaryRow({
  icon,
  label,
  metadata,
  timestamp,
  timestampLabel = t`Recorded`,
  title,
  onOpen,
  href,
}: {
  icon: ReactNode;
  label: string;
  metadata?: string;
  timestamp?: string;
  timestampLabel?: string;
  title?: string;
  onOpen?: (event: MouseEvent<HTMLButtonElement>) => void;
  href?: string;
}) {
  const className =
    'flex h-7 w-full min-w-0 items-center justify-start gap-1.5 rounded-sm px-1 text-left text-xs font-normal';
  const content = (
    <>
      <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {metadata ? (
        <span className="max-w-[35%] shrink-0 truncate text-[0.625rem] text-muted-foreground">
          {metadata}
        </span>
      ) : null}
      {timestamp ? <ClioRelativeTime timestamp={timestamp} label={timestampLabel} compact /> : null}
    </>
  );
  const description = title ?? [label, metadata].filter(Boolean).join(' — ');
  if (onOpen)
    return (
      <Button
        aria-label={t`Open ${label}`}
        className={className}
        onClick={onOpen}
        title={description}
        type="button"
        variant="ghost"
      >
        {content}
      </Button>
    );
  if (href)
    return (
      <ExternalLink
        className={cn(className, 'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring')}
        href={href}
        title={description}
      >
        {content}
      </ExternalLink>
    );
  return (
    <div className={className} title={description}>
      {content}
    </div>
  );
}
