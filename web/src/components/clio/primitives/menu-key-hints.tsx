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
 * The quiet footer line of a menu or picker: the keys that work in it, in the
 * platform's form. One line, never wraps; it is a hint, not a control.
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
        'flex h-7 items-center gap-3 overflow-hidden border-t border-border/70 px-2 text-[11px] whitespace-nowrap text-muted-foreground',
        className,
      )}
    >
      {hints.map((hint) => (
        <span className="inline-flex shrink-0 items-center gap-1" key={hint.id}>
          <ShortcutKeys className="text-[11px]" id={hint.id} />
          {hint.label}
        </span>
      ))}
    </div>
  );
});
