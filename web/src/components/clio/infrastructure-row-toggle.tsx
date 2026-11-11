import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode, SyntheticEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * The row's name as its expand control. It has no click handler of its own:
 * the click (or Enter/Space) reaches the row's own `onClick`, so the name,
 * the row and the keyboard all open the same details once.
 */
export function InfraRowToggle({
  expanded,
  label,
  children,
}: {
  expanded: boolean;
  /** Accessible name when it differs from the visible title ("Local details"). */
  label?: string;
  children: ReactNode;
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-label={label}
      className="max-w-full truncate rounded-[3px] text-left align-bottom outline-none focus-visible:ring-1 focus-visible:ring-ring"
      type="button"
    >
      {children}
    </button>
  );
}

/** The pinned chevron of an expandable row; the name is the control. */
export function InfraRowChevron({ expanded }: { expanded: boolean }) {
  return (
    <span aria-hidden="true" className="grid size-[22px] place-items-center text-muted-foreground">
      <ChevronRightIcon
        className={cn(
          'size-3.5 transition-transform motion-reduce:transition-none',
          expanded && 'rotate-90',
        )}
      />
    </span>
  );
}

/** Wraps a row's own actions so a click on them does not also open or close the row. */
export function InfraRowActions({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  return (
    <span className={className} onClick={stop} onKeyDown={stop}>
      {children}
    </span>
  );
}
