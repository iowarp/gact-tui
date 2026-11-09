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
  /**
   * Extra fixed-width columns between the name and the badge (source,
   * workspace). Each child sets its own width, the same on every row, and may
   * hide at narrow container widths; columns drop, they never shift.
   */
  columns?: ReactNode;
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
  /**
   * One always-visible action after the hover actions (26px): the row's main
   * verb (Start, Stop, Install, Open). Use an IconButton with a hover name.
   */
  primaryAction?: ReactNode;
  /** A trailing ⓘ (26px), always visible. */
  info?: ReactNode;
  /**
   * `inline` puts the description after the name on one 28px line. `stacked`
   * puts it on a second, smaller line under the name (a 34px row), for
   * inventories whose names need a short explanation.
   */
  layout?: 'inline' | 'stacked';
  /**
   * `activity` is the transcript's activity row: a 12px disclosure column
   * (`leading`) before the icon, 12.5px text, and the right edge ordered
   * badge, hover actions, elapsed, status, ⓘ — so the status sits next to
   * the time it explains. Empty columns keep their width.
   */
  variant?: 'list' | 'activity';
  /** The 12px column before the icon (an expand chevron) in `activity` rows. */
  leading?: ReactNode;
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
      columns,
      badge,
      meta,
      actions,
      actionsWidth = 44,
      primaryAction,
      info,
      layout = 'inline',
      variant = 'list',
      leading,
      selected = false,
      className,
      style,
      ...rest
    },
    ref,
  ) {
    if (variant === 'activity') {
      return (
        <div
          ref={ref}
          data-slot="list-row"
          data-variant="activity"
          data-selected={selected || undefined}
          aria-selected={rest.role === 'option' || rest.role === 'row' ? selected : undefined}
          style={style}
          className={cn(
            'group/list-row relative flex h-7 min-w-0 items-center gap-2 rounded-[6px] pl-2 text-[12.5px] whitespace-nowrap text-foreground/85 outline-none hover:bg-hover focus-visible:bg-hover focus-visible:ring-[1.5px] focus-visible:ring-ring focus-visible:ring-inset data-selected:bg-hover',
            className,
          )}
          {...rest}
        >
          <span className="-mr-0.5 grid w-3 shrink-0 place-items-center text-faint [&_svg:not([class*='size-'])]:size-3">
            {leading}
          </span>
          {icon ? (
            <span
              aria-hidden="true"
              className="grid size-3.5 shrink-0 place-items-center text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5"
            >
              {icon}
            </span>
          ) : null}
          <span className="shrink-0 text-foreground max-[480px]:hidden">{title}</span>
          <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            {description}
          </span>
          {columns}
          {badge !== undefined ? (
            <span className="flex w-[58px] shrink-0 justify-end">{badge}</span>
          ) : null}
          {actions !== undefined ? (
            <span
              data-slot="list-row-actions"
              style={{ width: actionsWidth }}
              className="invisible flex shrink-0 items-center justify-end group-focus-within/list-row:visible group-hover/list-row:visible max-sm:hidden"
            >
              {actions}
            </span>
          ) : null}
          {meta !== undefined ? (
            <span className="flex w-11 shrink-0 justify-end max-[480px]:hidden">{meta}</span>
          ) : null}
          <span className="flex w-4 shrink-0 justify-center">{status}</span>
          {primaryAction !== undefined ? (
            <span
              data-slot="list-row-primary-action"
              className="flex w-[26px] shrink-0 justify-center"
            >
              {primaryAction}
            </span>
          ) : null}
          <span className="-ml-1 flex w-[26px] shrink-0 justify-center">{info}</span>
        </div>
      );
    }
    return (
      <div
        ref={ref}
        data-slot="list-row"
        data-selected={selected || undefined}
        data-layout={layout}
        aria-selected={rest.role === 'option' || rest.role === 'row' ? selected : undefined}
        style={style}
        className={cn(
          'group/list-row relative flex min-w-0 items-center gap-2 rounded-[6px] px-1.5 text-[13px] whitespace-nowrap outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset data-selected:bg-menu-highlight',
          layout === 'stacked' ? 'min-h-[34px] gap-2.5 py-[3px] px-2 text-[12.5px]' : 'h-7',
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
        {layout === 'stacked' ? (
          <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
            <span className="min-w-0 truncate">{title}</span>
            {description ? (
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                {description}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="min-w-0 shrink truncate">{title}</span>
            {description ? (
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                {description}
              </span>
            ) : null}
          </span>
        )}
        {columns}
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
        {primaryAction !== undefined ? (
          <span
            data-slot="list-row-primary-action"
            className="flex w-[26px] shrink-0 justify-center"
          >
            {primaryAction}
          </span>
        ) : null}
        {info !== undefined ? (
          <span className="flex w-[26px] shrink-0 justify-center">{info}</span>
        ) : null}
      </div>
    );
  }),
);

/**
 * The small heading over a group of rows ("Errors", "Inference", "Storage on
 * ares"). One line; an optional trailing control (a total, Edit locations)
 * sits at the right edge.
 */
export const ListGroupLabel = memo(function ListGroupLabel({
  children,
  action,
  className,
  id,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      data-slot="list-group-label"
      className={cn(
        'flex h-7 min-w-0 items-end gap-1.5 px-2 pb-1 text-[11px] font-semibold whitespace-nowrap text-muted-foreground',
        className,
      )}
    >
      <h3 className="min-w-0 truncate" id={id}>
        {children}
      </h3>
      {action ? (
        <span className="ml-auto flex shrink-0 items-center gap-1 font-normal">{action}</span>
      ) : null}
    </div>
  );
});
