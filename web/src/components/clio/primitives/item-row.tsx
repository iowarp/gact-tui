import { forwardRef, memo, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
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
  /** Hover actions (IconButtons). Hidden with `visibility`, so they never move the row. */
  actions?: ReactNode;
  /** Keep the actions visible (touch, or an item that always offers them). */
  actionsVisible?: boolean;
  /** Right slot: one button (Use, Retry, Update, Trust) or a toggle. */
  slot?: ReactNode;
  /**
   * An inline confirmation ("Remove this rule?", Keep, Remove). It replaces
   * status, actions and slot with one right-aligned cell across those columns.
   */
  confirm?: ReactNode;
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
 * the actions float over the end of the name instead, left of the status.
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
      slot,
      confirm,
      statusWidth = 158,
      actionsWidth = 104,
      slotWidth = 84,
      selected = false,
      size = 'default',
      className,
      style,
      ...rest
    },
    ref,
  ) {
    // Below 24rem of list width a two-line row stacks, as setting rows do: the
    // status drops under the name, so a phone keeps the name readable.
    const stacks = size !== 'line';
    const columns: CSSProperties = {
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
          'group/item-row relative grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_var(--item-status)_var(--item-actions)_var(--item-slot)] items-center gap-x-2.5 border-b border-border/70 px-2 whitespace-nowrap outline-none',
          'hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
          'data-selected:bg-primary/10 data-selected:shadow-[inset_2px_0_var(--color-primary)]',
          'data-confirm:bg-destructive/[0.08] data-confirm:hover:bg-destructive/[0.08]',
          // A confirm sizes to its question and buttons; the name gives way, not the question.
          'data-confirm:grid-cols-[1.25rem_minmax(0,1fr)_auto]!',
          '@max-2xl:grid-cols-[1.25rem_minmax(0,1fr)_min(var(--item-status),9.875rem)_var(--item-actions)_var(--item-slot)]',
          !actionsVisible &&
            '@max-xl:grid-cols-[1.25rem_minmax(0,1fr)_min(var(--item-status),9.875rem)_var(--item-slot)]',
          stacks &&
            (actionsVisible
              ? '@max-sm:grid-cols-[1.25rem_minmax(0,1fr)_var(--item-actions)_var(--item-slot)]'
              : '@max-sm:grid-cols-[1.25rem_minmax(0,1fr)_var(--item-slot)]'),
          // A stacked confirm takes row 2, so the name and meta get the freed columns.
          stacks && '@max-sm:data-confirm:grid-cols-[1.25rem_minmax(0,1fr)]!',
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
          )}
        >
          <span
            className={cn(
              'min-w-0 truncate text-foreground',
              size === 'line' ? 'shrink text-[0.78125rem]' : 'text-[0.8125rem] font-medium',
            )}
            data-slot="item-row-title"
          >
            {title}
          </span>
          {meta ? (
            <span
              className={cn(
                'min-w-0 truncate text-faint',
                size === 'line' ? 'shrink-[100] text-[0.71875rem]' : 'text-xs',
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
        ) : (
          <>
            <span
              className={cn(
                'flex min-w-0 items-center overflow-hidden',
                stacks && '@max-sm:col-start-2 @max-sm:row-start-2',
              )}
              data-slot="item-row-status"
            >
              {status}
            </span>
            <span
              className={cn(
                'flex min-w-0 items-center justify-end gap-px',
                !actionsVisible &&
                  'invisible group-focus-within/item-row:visible group-hover/item-row:visible @max-xl:absolute @max-xl:inset-y-0 @max-xl:right-[calc(var(--item-slot)+min(var(--item-status),9.875rem)+1.75rem)] @max-xl:bg-hover @max-xl:pl-1',
                !actionsVisible && stacks && '@max-sm:right-[calc(var(--item-slot)+1.125rem)]',
              )}
              data-slot="item-row-actions"
            >
              {actions}
            </span>
            <span
              className={cn(
                'flex min-w-0 items-center justify-end gap-2',
                stacks && '@max-sm:row-span-2',
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
      role={label ? 'group' : undefined}
    >
      {children}
    </div>
  );
}
