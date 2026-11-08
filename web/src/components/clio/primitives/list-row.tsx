import { forwardRef, memo, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ListRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** The fixed 16px status column (a StatusIndicator in `column` display). */
  status?: ReactNode;
  icon?: ReactNode;
  /** The row's name; one line, ellipsis, full text on hover. */
  title: ReactNode;
  /** Muted words after the title (a path, a model), cut first when narrow. */
  description?: ReactNode;
  /** Fixed 58px column: a Tag. */
  badge?: ReactNode;
  /** Fixed 44px mono column: elapsed time, size or count (MetaValue). */
  meta?: ReactNode;
  /**
   * Hover actions in a fixed column. They are hidden with `visibility`, not
   * removed, so showing them never moves the row; keyboard focus inside the
   * row shows them too.
   */
  actions?: ReactNode;
  /** Width of the actions column in px; one value for every row of a list. */
  actionsWidth?: number;
  /** A trailing ⓘ (26px), always visible. */
  info?: ReactNode;
  selected?: boolean;
  /** For virtualized lists: the absolute position the virtualizer assigns. */
  style?: CSSProperties;
}

/**
 * One 28px line in a list (conversations, tasks, files, activity). Every
 * trailing column has a fixed width so rows line up and nothing shifts on
 * hover. It takes `ref` and `style` so a virtualizer can place it.
 */
export const ListRow = memo(
  forwardRef<HTMLDivElement, ListRowProps>(function ListRow(
    {
      status,
      icon,
      title,
      description,
      badge,
      meta,
      actions,
      actionsWidth = 44,
      info,
      selected = false,
      className,
      style,
      ...rest
    },
    ref,
  ) {
    return (
      <div
        ref={ref}
        data-slot="list-row"
        data-selected={selected || undefined}
        aria-selected={rest.role === 'option' || rest.role === 'row' ? selected : undefined}
        style={style}
        className={cn(
          'group/list-row relative flex h-7 min-w-0 items-center gap-2 rounded-[6px] px-1.5 text-[13px] whitespace-nowrap outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset data-selected:bg-menu-highlight',
          className,
        )}
        {...rest}
      >
        {status !== undefined ? (
          <span className="flex w-4 shrink-0 justify-center">{status}</span>
        ) : null}
        {icon ? (
          <span
            aria-hidden="true"
            className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg:not([class*='size-'])]:size-4"
          >
            {icon}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="min-w-0 shrink truncate">{title}</span>
          {description ? (
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
        {badge !== undefined ? (
          <span className="flex w-[58px] shrink-0 justify-end">{badge}</span>
        ) : null}
        {meta !== undefined ? <span className="flex w-11 shrink-0 justify-end">{meta}</span> : null}
        {actions !== undefined ? (
          <span
            data-slot="list-row-actions"
            style={{ width: actionsWidth }}
            className="invisible flex shrink-0 items-center justify-end gap-0.5 group-focus-within/list-row:visible group-hover/list-row:visible"
          >
            {actions}
          </span>
        ) : null}
        {info !== undefined ? (
          <span className="flex w-[26px] shrink-0 justify-center">{info}</span>
        ) : null}
      </div>
    );
  }),
);
