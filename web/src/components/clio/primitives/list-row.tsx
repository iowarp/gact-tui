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
  /**
   * The title keeps its width before the columns (inline rows): when both do
   * not fit, the columns drop whole rather than cut the title (a build
   * problem's message before its line).
   */
  titleFirst?: boolean;
  /** Fixed 58px column: a Tag. */
  badge?: ReactNode;
  /** Fixed 44px mono column: elapsed time, size or count (MetaValue). */
  meta?: ReactNode;
  /**
   * Hover actions in a fixed column. They are transparent at rest, not hidden
   * or removed, so showing them never moves the row and screen readers still
   * reach them; keyboard focus inside the row shows them too. Touch screens have no hover, so they always show there.
   */
  actions?: ReactNode;
  /** Width of the actions column in px; one value for every row of a list. */
  actionsWidth?: number;
  /**
   * One always-visible action after the hover actions (26px): the row's main
   * verb (Start, Stop, Install, Open). Use an IconButton with a hover name.
   */
  primaryAction?: ReactNode;
  /**
   * Show the actions in place of the meta column on hover or focus instead of
   * beside it, so a narrow list (the left bar) keeps one right edge: the count
   * or time at rest, the row's buttons on hover. An open menu keeps them shown.
   */
  actionsOverlay?: boolean;
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
   * drops its hover actions and an empty badge, and below 360px its elapsed, so
   * the text keeps room.
   *
   * `notice` is a notification (the bell, spec `.nf`): a 14px icon, the title (one
   * line, cut with … per `.d-nm`) and a faint 11px `meta` age in a 52px column
   * on the first line; the faint 11.5px `description` under the title
   * runs to the row's right edge, or stops before a `primaryAction` word pinned to
   * the bottom right. It carries no padding or fill; its container owns both,
   * so actions under it share the row.
   */
  variant?: 'list' | 'activity' | 'notice';
  /**
   * `notice` rows: the full title and description, when the shown content is
   * not the plain text. The app-wide truncation hint shows them on hover or
   * focus while the line is cut with ….
   */
  hoverText?: { title?: string; description?: string };
  /** `notice` rows: the title and description wrap whole instead of cutting. */
  expanded?: boolean;
  /**
   * The 12px column before the icon (an expand chevron) in `activity` rows. In
   * `list` rows it is the first column and sizes itself, the same width on
   * every row (the Activity timeline's agent strands).
   */
  leading?: ReactNode;
  /**
   * In a narrow `activity` row (below 280px) the name becomes the icon's hover
   * name so the target keeps the room. A row with no target sets this false and
   * keeps its name, cut with …, since the icon alone would say nothing.
   */
  titleCollapses?: boolean;
  /**
   * `activity` rows whose description ends in an outcome word: the elapsed
   * column drops below 480px so the outcome never clips.
   */
  metaYields?: boolean;
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
      titleFirst = false,
      badge,
      meta,
      actions,
      actionsWidth = 44,
      primaryAction,
      actionsOverlay = false,
      info,
      layout = 'inline',
      variant = 'list',
      hoverText,
      expanded = false,
      leading,
      titleCollapses = true,
      metaYields = false,
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
            'grid min-w-0 grid-cols-[14px_minmax(0,1fr)_52px] gap-x-2 text-[12.5px] whitespace-nowrap',
            className,
          )}
          {...rest}
        >
          <span
            aria-hidden="true"
            className="mt-0.5 grid size-3.5 place-items-center text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5"
          >
            {icon}
          </span>
          <span
            className={cn(
              'min-w-0 leading-[18px] text-muted-foreground',
              expanded ? 'break-words whitespace-normal' : 'truncate',
            )}
            data-full-text={hoverText?.title}
          >
            {title}
          </span>
          <span className="justify-self-end pt-px text-right text-[11px] leading-4 text-faint tabular-nums">
            {meta}
          </span>
          {description ? (
            <span
              className={cn(
                'col-start-2 mt-0.5 min-w-0 text-[11.5px] leading-[18px] text-faint',
                expanded ? 'break-words whitespace-normal' : 'truncate',
                primaryAction === undefined && 'col-span-2',
              )}
              data-full-text={hoverText?.description}
            >
              {description}
            </span>
          ) : null}
          {primaryAction !== undefined ? (
            <span className="col-start-3 self-end text-right text-[11.5px] leading-[18px] font-semibold text-accent-foreground">
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
            // 600px its empty and hover-only columns; below 360px (a quarter of the window, a
            // phone) its elapsed time; below 280px (`.xc.n2`, a fifth) its name becomes the
            // icon's hover name.
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
          <span
            data-slot="list-row-title"
            className={cn(
              'min-w-0 shrink truncate text-foreground',
              titleCollapses && '@max-[280px]/activity:sr-only',
            )}
          >
            {title}
          </span>
          {/* At least as wide as its outcome: an argument (no intrinsic width) gives up
              its room first, then the name, so the outcome stays whole. */}
          <span className="flex min-w-min flex-1 items-center gap-2 overflow-hidden">
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
              className="invisible flex shrink-0 items-center justify-end group-hover/list-row:visible group-has-[:focus-visible]/list-row:visible max-sm:hidden @max-[600px]/activity:hidden"
            >
              {actions}
            </span>
          ) : null}
          {meta !== undefined ? (
            <span
              className={cn(
                'block w-11 shrink-0 truncate text-right font-mono text-[11px] text-muted-foreground tabular-nums @max-[360px]/activity:hidden',
                metaYields && '@max-[480px]/activity:hidden',
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
        {leading}
        {status !== undefined ? (
          <span className="flex w-4 shrink-0 justify-center">{status}</span>
        ) : null}
        {icon ? (
          <span
            aria-hidden="true"
            data-slot="list-row-icon"
            className={cn(
              "grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg:not([class*='size-'])]:size-4",
              selectedTone === 'accent' && 'group-data-selected/list-row:text-accent-foreground',
            )}
          >
            {icon}
          </span>
        ) : null}
        {layout === 'stacked' ? (
          <span data-slot="list-row-text" className="flex min-w-0 flex-1 flex-col leading-[1.3]">
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
        ) : titleFirst ? (
          // One line tall: columns that do not fit beside the title wrap to a clipped second line.
          <span className="flex h-[1lh] min-w-0 flex-1 flex-wrap items-baseline gap-x-2 overflow-hidden">
            <span className="min-w-0 shrink truncate">{title}</span>
            {columns ? <span className="ml-auto flex shrink-0">{columns}</span> : null}
          </span>
        ) : (
          <span data-slot="list-row-text" className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="min-w-0 shrink truncate">{title}</span>
            {description ? (
              // Keeps a readable start (never a one-letter stub); the title truncates first.
              <span className="min-w-[min(5rem,35%)] flex-1 truncate text-[12px] text-muted-foreground">
                {description}
              </span>
            ) : null}
          </span>
        )}
        {titleFirst && layout !== 'stacked' ? null : columns}
        {badge !== undefined ? (
          <span className="flex w-[58px] shrink-0 justify-end">{badge}</span>
        ) : null}
        {meta !== undefined ? (
          <span
            data-slot="list-row-meta"
            className={cn(
              'flex w-11 shrink-0 justify-end',
              actionsOverlay &&
                actions !== undefined &&
                'group-focus-within/list-row:invisible group-hover/list-row:invisible group-has-[[aria-haspopup][aria-expanded=true]]/list-row:invisible pointer-coarse:invisible',
            )}
          >
            {meta}
          </span>
        ) : null}
        {actions !== undefined ? (
          <span
            data-slot="list-row-actions"
            style={{ width: actionsWidth }}
            className={cn(
              'flex shrink-0 items-center justify-end gap-0.5 opacity-0 group-focus-within/list-row:opacity-100 group-hover/list-row:opacity-100 group-has-[[aria-haspopup][aria-expanded=true]]/list-row:opacity-100 pointer-coarse:opacity-100',
              actionsOverlay && 'absolute inset-y-0 right-1.5 z-10',
            )}
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
