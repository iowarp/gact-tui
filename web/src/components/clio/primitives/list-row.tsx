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
   * the time it explains. Empty columns keep their width; below 600px the row
   * drops its hover actions, elapsed and an empty badge so the text keeps room.
   *
   * `notice` is a notification (the bell): the icon, the title and a faint
   * 11px `meta` time on the first line; the `description` under the title runs
   * to the row's right edge, or stops before a `primaryAction` word pinned to
   * the bottom right. It carries no padding or fill; its container owns both,
   * so actions under it share the row.
   */
  variant?: 'list' | 'activity' | 'notice';
  /** The 12px column before the icon (an expand chevron) in `activity` rows. */
  leading?: ReactNode;
  selected?: boolean;
  /**
   * `highlight` marks the selected row with the menu-highlight tone. `accent`
   * is the spec's chosen-item row (a service to open): accent fill, with the
   * icon, description and status in the accent foreground.
   */
  selectedTone?: 'highlight' | 'accent';
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
      selectedTone = 'highlight',
      className,
      style,
      ...rest
    },
    ref,
  ) {
    if (variant === 'notice') {
      return (
        <div
          ref={ref}
          data-slot="list-row"
          data-variant="notice"
          style={style}
          className={cn(
            'grid min-w-0 grid-cols-[16px_minmax(0,1fr)_auto] gap-x-2.5 text-[12.5px] whitespace-nowrap',
            className,
          )}
          {...rest}
        >
          <span
            aria-hidden="true"
            className="mt-px grid size-4 place-items-center text-muted-foreground [&_svg:not([class*='size-'])]:size-[15px]"
          >
            {icon}
          </span>
          <span className="min-w-0 truncate leading-[1.4] text-muted-foreground">{title}</span>
          <span className="pt-px text-[11px] text-faint tabular-nums">{meta}</span>
          {description ? (
            <span
              className={cn(
                'col-start-2 mt-0.5 min-w-0 truncate leading-[1.45] text-muted-foreground',
                primaryAction === undefined && 'col-span-2',
              )}
            >
              {description}
            </span>
          ) : null}
          {primaryAction !== undefined ? (
            <span className="col-start-3 self-end pl-2.5 text-right text-[12px] font-medium text-accent-foreground">
              {primaryAction}
            </span>
          ) : null}
        </div>
      );
    }
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
            // A container, so a narrow row sheds columns by its own width (spec U7): below
            // 600px its empty and hover-only columns; below 280px (`.xc.n2`, a fifth of the
            // window) its elapsed time, and its name becomes the icon's hover name.
            'group/list-row @container/activity relative flex h-7 min-w-0 items-center gap-2 rounded-[6px] pl-2 text-[12.5px] whitespace-nowrap text-foreground/85 outline-none hover:bg-hover focus-visible:bg-hover focus-visible:ring-[1.5px] focus-visible:ring-ring focus-visible:ring-inset data-selected:bg-hover',
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
              title={typeof title === 'string' ? title : undefined}
              className="grid size-3.5 shrink-0 place-items-center text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5"
            >
              {icon}
            </span>
          ) : null}
          <span className="shrink-0 text-foreground @max-[280px]/activity:sr-only">{title}</span>
          <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            {description}
          </span>
          {columns}
          {badge !== undefined ? (
            <span
              className={cn(
                'flex w-[58px] shrink-0 justify-end',
                badge === null && '@max-[600px]/activity:hidden',
              )}
            >
              {badge}
            </span>
          ) : null}
          {actions !== undefined ? (
            <span
              data-slot="list-row-actions"
              style={{ width: actionsWidth }}
              className="invisible flex shrink-0 items-center justify-end group-focus-within/list-row:visible group-hover/list-row:visible max-sm:hidden @max-[600px]/activity:hidden"
            >
              {actions}
            </span>
          ) : null}
          {meta !== undefined ? (
            <span
              className={cn(
                'flex w-11 shrink-0 justify-end @max-[280px]/activity:hidden',
                meta === null && '@max-[600px]/activity:hidden',
              )}
            >
              {meta}
            </span>
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
          'group/list-row relative flex min-w-0 items-center gap-2 rounded-[6px] px-1.5 text-[13px] whitespace-nowrap outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset data-selected:[&_.text-muted-foreground]:text-accent-foreground',
          selectedTone === 'accent'
            ? 'data-selected:bg-accent data-selected:hover:bg-accent'
            : 'data-selected:bg-menu-highlight',
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
            className={cn(
              "grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg:not([class*='size-'])]:size-4",
              selectedTone === 'accent' && 'group-data-selected/list-row:text-accent-foreground',
            )}
          >
            {icon}
          </span>
        ) : null}
        {layout === 'stacked' ? (
          <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
            <span className="min-w-0 truncate">{title}</span>
            {description ? (
              <span
                className={cn(
                  'min-w-0 truncate text-[11px] text-muted-foreground',
                  selectedTone === 'accent' &&
                    'group-data-selected/list-row:text-accent-foreground',
                )}
              >
                {description}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="min-w-0 shrink truncate">{title}</span>
            {description ? (
              // Keeps a readable start (never a one-letter stub); the title truncates first.
              <span className="min-w-[min(5rem,35%)] flex-1 truncate text-[12px] text-muted-foreground">
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
