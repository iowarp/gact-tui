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
  /** Column widths in px; one value for every row of a list. 0 drops the column. */
  statusWidth?: number;
  actionsWidth?: number;
  slotWidth?: number;
  selected?: boolean;
  /** 34px rows for nested lists (a plugin's skills). */
  size?: 'default' | 'sm';
}

/**
 * Item row (D): icon and name with a meta line, then fixed columns for status,
 * hover actions and a slot. Every row of a list shares the column widths, so
 * status words and buttons line up. Below 36rem of list width the status column
 * narrows to at most 7.5rem (still one width for every row), the slot keeps its
 * width, and hover actions float over the row's right side instead of reserving
 * a column, so the name keeps the room.
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
        data-selected={selected || undefined}
        style={columns}
        className={cn(
          'group/item-row relative grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_var(--item-status)_var(--item-actions)_var(--item-slot)] items-center gap-x-2.5 border-b border-border/70 px-2 whitespace-nowrap outline-none',
          'hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
          'data-selected:bg-primary/10 data-selected:shadow-[inset_2px_0_var(--color-primary)]',
          actionsVisible
            ? '@max-xl:grid-cols-[1.25rem_minmax(0,1fr)_min(var(--item-status),7.5rem)_var(--item-actions)_var(--item-slot)]'
            : '@max-xl:grid-cols-[1.25rem_minmax(0,1fr)_min(var(--item-status),7.5rem)_var(--item-slot)]',
          size === 'sm' ? 'min-h-[2.125rem] py-0.5' : 'min-h-[2.875rem] py-[0.1875rem]',
          className,
        )}
        {...rest}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid place-items-center text-muted-foreground',
            size === 'sm'
              ? "[&_svg:not([class*='size-'])]:size-3.5"
              : "[&_svg:not([class*='size-'])]:size-4",
          )}
        >
          {icon}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            className="min-w-0 truncate text-[0.8125rem] font-medium text-foreground"
            data-slot="item-row-title"
          >
            {title}
          </span>
          {meta ? (
            <span className="min-w-0 truncate text-xs text-faint" data-slot="item-row-meta">
              {meta}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center overflow-hidden" data-slot="item-row-status">
          {status}
        </span>
        <span
          className={cn(
            'flex min-w-0 items-center justify-end gap-px',
            !actionsVisible &&
              'invisible group-focus-within/item-row:visible group-hover/item-row:visible @max-xl:absolute @max-xl:inset-y-0 @max-xl:right-[calc(var(--item-slot)+1.125rem)] @max-xl:bg-hover @max-xl:w-[min(var(--item-status),7.5rem)] @max-xl:min-w-max',
          )}
          data-slot="item-row-actions"
        >
          {actions}
        </span>
        <span className="flex min-w-0 items-center justify-end gap-2" data-slot="item-row-slot">
          {slot}
        </span>
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
