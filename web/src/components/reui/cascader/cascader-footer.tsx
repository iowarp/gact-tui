import * as React from 'react';
import { useCascaderActions } from '@/components/reui/cascader/cascader-context';
import {
  CASCADER_LIST_PAD_CLASS,
  getCascaderFooterStops,
} from '@/components/reui/cascader/cascader-lib';

import { cn } from '@/lib/utils';

/**
 * The pinned footer: a strip of COMMANDS below the list, a SIBLING of
 * `CascaderList`. Nothing here joins the selection, the filter set or the
 * highlight. It sits outside `CascaderList` because `Combobox.List` clicks its
 * highlighted row on Enter.
 */

/* -------------------------------------------------------------------------- */
/*                                   Footer                                   */
/* -------------------------------------------------------------------------- */

/**
 * Keys the option list acts on, swallowed at the footer boundary. Escape and
 * Tab are absent on purpose: Escape must reach the root, Tab must keep moving.
 */
const FOOTER_SWALLOWED_KEYS = new Set([
  'Enter',
  ' ',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export type CascaderFooterProps = React.ComponentProps<'div'>;

/** Renders its children, or nothing at all when it is given none. */
function CascaderFooter({ className, children, onKeyDown, ...props }: CascaderFooterProps) {
  const { labels } = useCascaderActions();
  const hasChildren = React.Children.count(children) > 0;

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      if (!FOOTER_SWALLOWED_KEYS.has(event.key)) return;
      event.stopPropagation();

      // The strip's own vertical movement, and the way back from the list's
      // hand-off: either end returns focus to the search field, from which
      // Base UI's empty highlight resumes the list. Down wraps to the FIELD,
      // not a command (traps the arrows) or a row (no imperative highlight).
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const footer = event.currentTarget;
      const stops = getCascaderFooterStops(footer);
      const active = document.activeElement as HTMLElement | null;
      const index = active ? stops.indexOf(active) : -1;
      if (index === -1) return;
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? stops[index + 1] : stops[index - 1];
      if (next) {
        next.focus();
        return;
      }
      if (event.key === 'ArrowUp' && index > 0) return;
      footer
        .closest<HTMLElement>('[data-slot="cascader-panel"]')
        ?.querySelector<HTMLElement>('[data-slot="cascader-input"]')
        ?.focus();
    },
    [onKeyDown],
  );

  if (!hasChildren) return null;

  return (
    <div
      data-slot="cascader-footer"
      /* Named, not a bare div: without it a screen reader reaches the actions
         with nothing to say they are not more options. */
      role="group"
      aria-label={labels.actionsLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        'border-border/60 flex shrink-0 flex-col gap-0.5 border-t',
        /* The LIST's padding, not a flat `p-1`: with a padding of its own the
           two columns of text were 2px out in luma and sera and 4px out in
           lyra. It also gives a separator in here a number to cancel. */
        CASCADER_LIST_PAD_CLASS,
        'p-(--cascader-list-pad,4px)',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
export { CascaderFooter };
