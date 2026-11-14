import type { ReactNode } from 'react';
import { monogramInitials } from '@/lib/monogram';
import { cn } from '@/lib/utils';

/**
 * A round badge with a name's initials: a person's profile, or a connector with no
 * logo. A name with no letters shows the fallback glyph. It is decoration beside the
 * name, which always appears in words next to it.
 */
export function Monogram({
  name,
  fallback,
  className,
}: {
  name: string;
  fallback?: ReactNode;
  className?: string;
}) {
  const initials = monogramInitials(name);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-[26px] shrink-0 place-items-center rounded-full bg-accent text-caption font-semibold text-accent-foreground',
        className,
      )}
      data-slot="monogram"
    >
      {initials || fallback}
    </span>
  );
}
