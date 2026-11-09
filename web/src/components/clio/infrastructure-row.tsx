import {
  createContext,
  forwardRef,
  memo,
  useContext,
  useId,
  useMemo,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { ListGroupLabel, ListRow } from '@/components/clio/primitives/list-row';
import { StatusIndicator, type StatusTone } from '@/components/clio/primitives/status-indicator';
import { cn } from '@/lib/utils';

/** Infrastructure facts: a 46% label column, right-aligned values, 25px rows. */
export const INFRA_FACTS_GRID =
  'max-w-[440px] auto-rows-[25px] grid-cols-[46%_minmax(0,1fr)] gap-y-0';

interface InfraColumns {
  /** Status column: mark and words ("Running", "2 connected"). */
  status: number;
  /** Meta column: host, port, runtime or time; hidden on narrow lists. */
  meta: number;
  /** Hover actions before the pinned action. 0 when the list has none. */
  hover: number;
  /** Whether rows reserve the 26px pinned action column. */
  pinned: boolean;
}

const InfraColumnsContext = createContext<InfraColumns>({
  status: 112,
  meta: 80,
  hover: 0,
  pinned: true,
});

/**
 * One infrastructure inventory: rows share the same status, meta and action
 * column widths, so every status word and every primary action lines up.
 */
export function InfraList({
  label,
  heading,
  headingAction,
  status = 112,
  meta = 80,
  hover = 0,
  pinned = true,
  className,
  children,
}: {
  /** Accessible name when the list has no visible heading. */
  label?: string;
  /** A visible group heading ("Inference", "Errors") that names the list. */
  heading?: ReactNode;
  headingAction?: ReactNode;
  status?: number;
  meta?: number;
  hover?: number;
  pinned?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const columns = useMemo(() => ({ status, meta, hover, pinned }), [status, meta, hover, pinned]);
  const headingId = useId();
  return (
    <InfraColumnsContext.Provider value={columns}>
      <div className={cn('@container/infra flex min-w-0 flex-col', className)}>
        {heading ? (
          <ListGroupLabel action={headingAction} id={headingId}>
            {heading}
          </ListGroupLabel>
        ) : null}
        <div
          aria-label={heading ? undefined : label}
          aria-labelledby={heading ? headingId : undefined}
          className="flex min-w-0 flex-col"
          role="list"
        >
          {children}
        </div>
      </div>
    </InfraColumnsContext.Provider>
  );
}

export interface InfraStatus {
  tone: StatusTone;
  label: string;
}

export interface InfraRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title' | 'children'> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  status?: InfraStatus;
  /** Faint trailing words (host, port, runtime) or a small progress bar. */
  meta?: ReactNode;
  /** Shown on hover or focus, before the pinned action. */
  actions?: ReactNode;
  /** The row's main verb, always visible (Start, Stop, Install, Open). */
  primaryAction?: ReactNode;
  /** Facts shown under the row while it is expanded. */
  details?: ReactNode;
  selected?: boolean;
}

/** A two-line inventory row with fixed status, meta and action columns. */
export const InfraRow = memo(
  forwardRef<HTMLDivElement, InfraRowProps>(function InfraRow(
    { icon, title, description, status, meta, actions, primaryAction, details, ...rest },
    ref,
  ) {
    const columns = useContext(InfraColumnsContext);
    const metaTitle = typeof meta === 'string' ? meta : undefined;
    return (
      <div className="min-w-0" role="listitem">
        <ListRow
          ref={ref}
          layout="stacked"
          icon={icon}
          title={title}
          description={description}
          columns={
            <>
              <span className="flex shrink-0 overflow-hidden" style={{ width: columns.status }}>
                {status ? <StatusIndicator label={status.label} tone={status.tone} /> : null}
              </span>
              {columns.meta ? (
                <span
                  className="hidden shrink-0 items-center justify-end gap-1.5 overflow-hidden text-[11px] text-muted-foreground @lg/infra:flex"
                  style={{ width: columns.meta }}
                  title={metaTitle}
                >
                  {typeof meta === 'string' ? <span className="truncate">{meta}</span> : meta}
                </span>
              ) : null}
            </>
          }
          actions={columns.hover ? (actions ?? null) : undefined}
          actionsWidth={columns.hover}
          primaryAction={columns.pinned ? (primaryAction ?? null) : undefined}
          {...rest}
        />
        {details ? <InfraRowDetails>{details}</InfraRowDetails> : null}
      </div>
    );
  }),
);

/** Facts under an expanded row, indented to the name and ruled on the left. */
export function InfraRowDetails({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-1.5 ml-[18px] flex min-w-0 flex-col gap-1.5 border-l border-border py-1 pr-2 pl-[22px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A small inline progress bar with its percentage, for the meta column. */
export function InfraProgress({ value, label }: { value: number; label?: string }) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        aria-label={label ?? `${percent}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="h-1 w-11 shrink-0 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </span>
      <span className="tabular-nums">{percent}%</span>
    </span>
  );
}
