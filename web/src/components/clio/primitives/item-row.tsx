import { forwardRef, memo, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { rowArrowKeyDown } from '@/lib/row-arrow-keys';
import { cn } from '@/lib/utils';

export interface ItemRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'slot'> {
  /** 16px glyph in the first column (a provider logo, a plug, a skill spark). */
  icon?: ReactNode;
  /** The item's name, one line, ellipsis. */
  title: ReactNode;
  /** One muted line under the name (address, source, counts). */
  meta?: ReactNode;
  /** Fixed status column: a StatusIndicator with its words. */
  status?: ReactNode;
  /** Hover actions (IconButtons). Transparent until hover or focus, so they never move the row and Tab still reaches them. */
  actions?: ReactNode;
  /** Keep the actions visible (touch, or an item that always offers them). */
  actionsVisible?: boolean;
  /**
   * Hidden actions take no column: on hover or focus they float over the end of
   * the row, left of the slot, and the name and meta get the width. Only for rows
   * without a status; the slot sizes to its content.
   */
  floatActions?: boolean;
  /**
   * The last action is a ⋯ menu that holds every action. On a phone-width list
   * the others fold into it and it stays visible in its own column; on a touch
   * screen with room for the actions column, they stay visible there.
   */
  foldActions?: boolean;
  /** Right slot: one button (Use, Retry, Update, Trust) or a toggle. */
  slot?: ReactNode;
  /**
   * An inline confirmation ("Remove this rule?", Keep, Remove). It replaces
   * status, actions and slot with one right-aligned cell across those columns.
   */
  confirm?: ReactNode;
  /**
   * Icon column width in px (default 20). Widen it on every row of a list that
   * shows a provider wordmark, so the names stay aligned.
   */
  iconWidth?: number;
  /** Column widths in px; one value for every row of a list. 0 drops the column. */
  statusWidth?: number;
  actionsWidth?: number;
  slotWidth?: number;
  selected?: boolean;
  /**
   * `default` 46px name over meta; `sm` 34px for nested lists (a plugin's skills);
   * `line` the 30px one-line row (name then muted meta) for pickers, menus and dense lists.
   */
  size?: 'default' | 'sm' | 'line';
  /**
   * The meta line may wrap to a second line instead of ending in an ellipsis,
   * for descriptions that run long in some languages (Greek, Japanese).
   */
  wrapMeta?: boolean;
  /**
   * Stacked (below 24rem of list width), the name wraps whole instead of ending
   * in an ellipsis, for long localized names a phone can't hover to read.
   */
  wrapTitle?: boolean;
}

/**
 * Item row (D): icon and name with a meta line, then fixed columns for status,
 * hover actions and a slot. `size="line"` is the shared 30px one-line row
 * (name, then muted meta that shrinks first). Every row of a list shares the
 * column widths, so status words and buttons line up. Below 42rem of list width
 * the status column narrows to at most 9.875rem (the spec's 158 px), enough for
 * "Update waits for trust" (still one width for every row). Hover actions keep
 * their own column after the status, as in the spec, so they never cover the
 * name or meta. Below 36rem that column would squeeze the name under ~150 px, so
 * the actions float over the status cell instead (a row without a status keeps
 * the column).
 */
export const ItemRow = memo(
  forwardRef<HTMLDivElement, ItemRowProps>(function ItemRow(
    {
      icon,
      title,
      meta,
      status,
      actions,
      actionsVisible = false,
      floatActions = false,
      foldActions = false,
      slot,
      confirm,
      iconWidth,
      statusWidth = 158,
      actionsWidth = 104,
      slotWidth = 84,
      selected = false,
      size = 'default',
      wrapMeta = false,
      wrapTitle = false,
      className,
      style,
      ...rest
    },
    ref,
  ) {
    // Below 24rem of list width a two-line row stacks, as setting rows do: the
    // status drops under the name, so a phone keeps the name readable.
    const stacks = size !== 'line';
    const folds = stacks && foldActions && actions !== undefined;
    // Narrow, hidden actions float over the status (its words return when the
    // pointer leaves), never over the name or meta; a row without a status
    // keeps their column.
    const overlay = !actionsVisible && status !== undefined;
    const floats = floatActions && !actionsVisible && status === undefined && !foldActions;
    const hasSlot = slot !== undefined && slot !== null && slot !== false;
    // Stacked, hidden actions with no status or slot to sit over float over the
    // name's end, so a long name (a folder path) gets the row instead of a column
    // that stays empty until hover.
    const floatsOverName =
      stacks &&
      !overlay &&
      !folds &&
      !floats &&
      !actionsVisible &&
      !hasSlot &&
      actions !== undefined;
    const columns: CSSProperties = {
      ['--item-icon' as string]: iconWidth === undefined ? '1.25rem' : `${iconWidth}px`,
      ['--item-status' as string]: `${status === undefined ? 0 : statusWidth}px`,
      ['--item-actions' as string]: `${actions === undefined ? 0 : actionsWidth}px`,
      ['--item-slot' as string]: `${slot === undefined ? 0 : slotWidth}px`,
      ...style,
    };
    return (
      <div
        ref={ref}
        data-slot="item-row"
        data-confirm={confirm ? '' : undefined}
        data-selected={selected || undefined}
        style={columns}
        className={cn(
          'group/item-row relative grid min-w-0 grid-cols-[var(--item-icon)_minmax(0,1fr)_var(--item-status)_var(--item-actions)_var(--item-slot)] items-center gap-x-2.5 border-b border-border/70 px-2 whitespace-nowrap outline-none',
          'hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
          'data-selected:bg-primary/10 data-selected:shadow-[inset_2px_0_var(--color-primary)]',
          'data-confirm:bg-destructive/[0.08] data-confirm:hover:bg-destructive/[0.08]',
          // A confirm sizes to its question and buttons; the name gives way, not the question.
          'data-confirm:grid-cols-[var(--item-icon)_minmax(0,1fr)_auto]!',
          '@max-2xl:grid-cols-[var(--item-icon)_minmax(0,1fr)_min(var(--item-status),9.875rem)_var(--item-actions)_var(--item-slot)]',
          overlay &&
            '@max-xl:grid-cols-[var(--item-icon)_minmax(0,1fr)_min(var(--item-status),9.875rem)_var(--item-slot)]',
          // Stacked, the slot track fits its button: a localized "Update" outgrows the fixed column.
          stacks &&
            (folds
              ? '@max-sm:grid-cols-[var(--item-icon)_minmax(0,1fr)_1.625rem_minmax(var(--item-slot),max-content)]'
              : !overlay
                ? '@max-sm:grid-cols-[var(--item-icon)_minmax(0,1fr)_var(--item-actions)_minmax(var(--item-slot),max-content)]'
                : '@max-sm:grid-cols-[var(--item-icon)_minmax(0,1fr)_minmax(var(--item-slot),max-content)]'),
          // A stacked confirm takes row 2, so the name and meta get the freed columns.
          stacks && '@max-sm:data-confirm:grid-cols-[var(--item-icon)_minmax(0,1fr)]!',
          // Stacked, an empty slot kept only for alignment gives its width to the name and status.
          stacks && !hasSlot && '@max-sm:[--item-slot:0px]!',
          // With the actions over the status, a row with no slot drops that track and its gap,
          // so a status word ("Αξιόπιστο") fits whole beside the dot.
          stacks &&
            overlay &&
            !folds &&
            !hasSlot &&
            '@max-sm:grid-cols-[var(--item-icon)_minmax(0,1fr)]!',
          // Stacked, a labelled slot button takes its own line under the text, so its column goes too.
          stacks &&
            !floats &&
            '@max-sm:has-[[data-slot=item-row-slot]_[data-slot=button]]:[--item-slot:0px]!',
          // Hidden actions in their own column join that line too, so the name gets their width.
          stacks &&
            !floats &&
            !overlay &&
            !folds &&
            '@max-sm:has-[[data-slot=item-row-slot]_[data-slot=button]]:[--item-actions:0px]!',
          floatsOverName && '@max-sm:[--item-actions:0px]!',
          // Floating actions: the name, then a slot that is only as wide as its content.
          floats && 'grid-cols-[var(--item-icon)_minmax(0,1fr)_auto]!',
          size === 'line'
            ? 'h-[1.875rem] gap-x-[0.5625rem] rounded-[7px] border-b-0'
            : size === 'sm'
              ? 'min-h-[2.125rem] py-0.5'
              : 'min-h-[2.875rem] py-[0.1875rem]',
          className,
        )}
        {...rest}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid place-items-center text-muted-foreground',
            stacks && '@max-sm:row-span-2',
            size === 'sm'
              ? "[&_svg:not([class*='size-'])]:size-3.5"
              : size === 'line'
                ? "[&_svg:not([class*='size-'])]:size-[0.9375rem]"
                : "[&_svg:not([class*='size-'])]:size-4",
          )}
        >
          {icon}
        </span>
        <span
          className={cn(
            'flex min-w-0',
            size === 'line' ? 'items-baseline gap-[0.5625rem]' : 'flex-col gap-0.5',
            // With the slot button on its own line, the name also takes the emptied tracks' gaps.
            stacks &&
              !floats &&
              !folds &&
              '@max-sm:group-has-[[data-slot=item-row-slot]_[data-slot=button]]/item-row:col-[2/-1]',
            // Pinned to the first line: the actions floating over its end hold that line too.
            floatsOverName && '@max-sm:col-[2/-1] @max-sm:row-start-1',
          )}
        >
          <span
            className={cn(
              'min-w-0 truncate text-foreground',
              size === 'line' ? 'max-w-full shrink-0 text-menu' : 'text-ui font-medium',
              wrapTitle &&
                stacks &&
                '@max-sm:leading-snug @max-sm:break-words @max-sm:whitespace-normal @max-sm:[word-break:auto-phrase] @max-sm:[line-break:strict] @max-sm:hyphens-auto @max-sm:[hyphenate-limit-chars:10_4_4]',
            )}
            data-slot="item-row-title"
          >
            {title}
          </span>
          {meta ? (
            <span
              className={cn(
                'min-w-0 text-muted-foreground',
                wrapMeta && size !== 'line'
                  ? 'line-clamp-2 leading-snug break-words whitespace-normal [word-break:auto-phrase] [line-break:strict]'
                  : 'truncate',
                size === 'line' ? 'shrink-[100] text-label' : 'text-xs',
                // Stacked, a phone's column fits fewer words per line ("Φάκελος / χώρου / εργασίας").
                wrapMeta && stacks && '@max-sm:line-clamp-3',
              )}
              data-slot="item-row-meta"
            >
              {meta}
            </span>
          ) : null}
        </span>
        {confirm ? (
          // The confirming action is solid, not the tinted destructive button.
          <span
            className={cn(
              'col-[3/-1] flex min-w-0 items-center justify-end gap-2',
              stacks && '@max-sm:col-[2/-1] @max-sm:row-start-2',
              '[&_[data-variant=destructive]]:bg-destructive [&_[data-variant=destructive]]:text-background [&_[data-variant=destructive]:hover]:bg-destructive/90',
              'dark:[&_[data-variant=destructive]]:bg-[color-mix(in_oklab,var(--destructive)_45%,var(--background))] dark:[&_[data-variant=destructive]]:text-foreground dark:[&_[data-variant=destructive]:hover]:bg-[color-mix(in_oklab,var(--destructive)_55%,var(--background))]',
            )}
            data-slot="item-row-confirm"
          >
            {confirm}
          </span>
        ) : floats ? (
          <span
            className={cn(
              'relative flex min-w-0 items-center justify-end gap-2 self-stretch [&_[data-slot=button]]:text-xs',
              stacks && '@max-sm:row-span-2',
            )}
            data-slot="item-row-slot"
          >
            <span
              className={cn(
                'pointer-events-none absolute inset-y-0 right-full flex items-center justify-end gap-px bg-hover pl-1 opacity-0',
                'group-focus-within/item-row:pointer-events-auto group-focus-within/item-row:opacity-100 group-hover/item-row:pointer-events-auto group-hover/item-row:opacity-100',
                // A touch screen has no hover and a tap doesn't focus the row: keep them in the row.
                'pointer-coarse:pointer-events-auto pointer-coarse:static pointer-coarse:bg-transparent pointer-coarse:pl-0 pointer-coarse:opacity-100',
                hasSlot && 'mr-2 pointer-coarse:mr-0',
              )}
              data-slot="item-row-actions"
            >
              {actions}
            </span>
            {slot}
          </span>
        ) : (
          <>
            <span
              className={cn(
                'flex min-w-0 items-center overflow-hidden text-xs text-muted-foreground',
                // Pinned with the actions that float over it, so the slot keeps its column.
                overlay && '@max-xl:col-start-3 @max-xl:row-start-1',
                stacks && '@max-sm:col-start-2 @max-sm:row-start-2',
                // Beside a slot button, the status line runs under it too, so its words stay whole.
                stacks && hasSlot && !folds && '@max-sm:col-[2/-1]',
                // A folded ⋯ beside a labelled button's own line keeps to the name, so the status runs under it.
                folds &&
                  '@max-sm:group-has-[[data-slot=item-row-slot]_[data-slot=button]]/item-row:col-[2/-1]',
                // On its own line, a long localized status wraps rather than clipping.
                stacks &&
                  '@max-sm:[&_[data-slot=status-indicator]>span]:break-words @max-sm:[&_[data-slot=status-indicator]>span]:whitespace-normal @max-sm:[&_[data-slot=status-indicator]>span]:[word-break:auto-phrase] @max-sm:[&_[data-slot=status-indicator]>span]:[line-break:strict] @max-sm:[&_[data-slot=status-indicator]>span]:hyphens-auto @max-sm:[&_[data-slot=status-indicator]>span]:[hyphenate-limit-chars:10_4_4]',
              )}
              data-slot="item-row-status"
            >
              {status}
            </span>
            <span
              className={cn(
                'flex min-w-0 items-center justify-end gap-px',
                !actionsVisible &&
                  'pointer-events-none opacity-0 group-focus-within/item-row:pointer-events-auto group-focus-within/item-row:opacity-100 group-hover/item-row:pointer-events-auto group-hover/item-row:opacity-100',
                // In the status cell, over its words; stacked, the status line under the name.
                overlay && '@max-xl:col-start-3 @max-xl:row-start-1 @max-xl:bg-hover @max-xl:pl-1',
                overlay && stacks && !folds && '@max-sm:col-start-2 @max-sm:row-start-2',
                // Beside a labelled slot button on its own line, at that line's end.
                stacks &&
                  !overlay &&
                  !folds &&
                  '@max-sm:group-has-[[data-slot=item-row-slot]_[data-slot=button]]/item-row:col-[2/-1] @max-sm:group-has-[[data-slot=item-row-slot]_[data-slot=button]]/item-row:row-[3] @max-sm:group-has-[[data-slot=item-row-slot]_[data-slot=button]]/item-row:justify-self-end @max-sm:group-has-[[data-slot=item-row-slot]_[data-slot=button]]/item-row:pt-1',
                // Over the end of the name's first line, as overlay actions sit over the status.
                // One line tall (a 12.5px/1.4 line), so a wrapped name's second line stays clear.
                floatsOverName &&
                  '@max-sm:col-[2/-1] @max-sm:row-start-1 @max-sm:h-[1.09375rem] @max-sm:self-start @max-sm:justify-self-end @max-sm:bg-hover @max-sm:pl-1 @max-sm:[&_button]:h-full',
                folds &&
                  '@xl:pointer-coarse:pointer-events-auto @xl:pointer-coarse:opacity-100 @max-sm:pointer-events-auto @max-sm:opacity-100 @max-sm:static @max-sm:row-span-2 @max-sm:bg-transparent @max-sm:pl-0 @max-sm:[&>*:not(:last-child)]:hidden',
                folds &&
                  '@max-sm:group-has-[[data-slot=item-row-slot]_[data-slot=button]]/item-row:row-span-1',
              )}
              data-slot="item-row-actions"
            >
              {actions}
            </span>
            <span
              className={cn(
                // Spec `.xi .btn`: slot buttons read 12px/500 whatever size they were given.
                'flex min-w-0 items-center justify-end gap-2 [&_[data-slot=button]]:text-xs',
                stacks &&
                  (hasSlot && !folds
                    ? '@max-sm:col-end-[-1] @max-sm:row-start-1'
                    : '@max-sm:row-span-2'),
                (floatsOverName || (overlay && !folds && !hasSlot)) && '@max-sm:hidden',
                // A labelled button ("Update", "Change") gets a line of its own, start-aligned
                // under the name and meta, so a localized label never squeezes the name. Its
                // indent is a spacer that gives way first, so a label wider than the name column
                // ("Εγκατάσταση" at 260 px and 150%) moves left under the icon instead of overflowing.
                stacks &&
                  '@max-sm:has-[[data-slot=button]]:col-[1/-1] @max-sm:has-[[data-slot=button]]:row-[3] @max-sm:has-[[data-slot=button]]:max-w-full @max-sm:has-[[data-slot=button]]:justify-self-start @max-sm:has-[[data-slot=button]]:justify-start @max-sm:has-[[data-slot=button]]:pt-1',
                stacks &&
                  "@max-sm:has-[[data-slot=button]]:before:w-[calc(var(--item-icon)+0.125rem)] @max-sm:has-[[data-slot=button]]:before:min-w-0 @max-sm:has-[[data-slot=button]]:before:shrink @max-sm:has-[[data-slot=button]]:before:content-['']",
              )}
              data-slot="item-row-slot"
            >
              {slot}
            </span>
          </>
        )}
      </div>
    );
  }),
);

/** A run of item rows; its width drives the narrow column rules. */
export function ItemList({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** Names the list for assistive technology. */
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      className={cn('@container min-w-0', className)}
      onKeyDown={(event) => {
        // A section that moves between its lists ([data-row-keys]) owns the keys.
        if (event.currentTarget.parentElement?.closest('[data-row-keys]')) return;
        rowArrowKeyDown(event);
      }}
      role={label ? 'group' : undefined}
    >
      {children}
    </div>
  );
}
