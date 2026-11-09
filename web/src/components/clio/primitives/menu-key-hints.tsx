import { memo } from 'react';
import { cn } from '@/lib/utils';
import { ShortcutKeys } from './key-chip';

export interface MenuKeyHint {
  /** Catalog id of the key. */
  id: string;
  /** One verb: move, switch, open. */
  label: string;
}

/**
 * The quiet footer line of a menu or picker: the keys that work in it as
 * small caps, in the platform's form. One line, never wraps; it is a hint,
 * not a control.
 */
export const MenuKeyHints = memo(function MenuKeyHints({
  hints,
  className,
}: {
  hints: readonly MenuKeyHint[];
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-slot="menu-key-hints"
      className={cn(
        'flex h-[30px] items-center gap-2.5 overflow-hidden border-t border-border/70 px-2 text-[11px] whitespace-nowrap text-muted-foreground',
        className,
      )}
    >
      {hints.map((hint) => (
        <span className="inline-flex shrink-0 items-center gap-1" key={hint.id}>
          <ShortcutKeys capSize="sm" id={hint.id} variant="caps" />
          {hint.label}
        </span>
      ))}
    </div>
  );
});
