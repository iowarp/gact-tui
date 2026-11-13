import { ChevronDownIcon } from 'lucide-react';
import { useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { IconButton } from './primitives/icon-button';
import { useHasTruncatedText } from './primitives/use-has-truncated-text';
import { t } from '@lingui/core/macro';

export interface NoticeFrameProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** What the notice is about, for the expand control's name. */
  subject: string;
  children: (expanded: boolean) => ReactNode;
}

/**
 * A notification's frame. Its cut title and description read whole on hover
 * (the app-wide truncation hint); while anything is cut, a chevron under the
 * icon also opens the whole notice in place, and closes it again.
 */
export function NoticeFrame({ subject, children, className, ...rest }: NoticeFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const cut = useHasTruncatedText(ref, expanded);
  return (
    <div
      className={cn('relative', className)}
      data-expanded={expanded || undefined}
      ref={ref}
      {...rest}
    >
      {children(expanded)}
      {expanded || cut ? (
        <IconButton
          aria-expanded={expanded}
          className="absolute top-[25px] left-[5px] size-5 text-faint hover:bg-menu-highlight"
          icon={
            <ChevronDownIcon
              className={cn('size-3.5 motion-safe:transition-transform', expanded && 'rotate-180')}
            />
          }
          label={expanded ? t`Show less of ${subject}` : t`Show all of ${subject}`}
          onClick={() => setExpanded((open) => !open)}
          size="sm"
          tooltipSide="left"
        />
      ) : null}
    </div>
  );
}
