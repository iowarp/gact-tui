import {
  createContext,
  forwardRef,
  memo,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { ListGroupLabel, ListRow } from '@/components/clio/primitives/list-row';
import { StatusIndicator, type StatusTone } from '@/components/clio/primitives/status-indicator';
import { statusWordClass } from '@/components/clio/primitives/status-word-tone';
import { withAddressBreaks } from '@/lib/address-breaks';
import { isRowMenuKey } from '@/lib/settings-row-keys';
import { cn } from '@/lib/utils';

/**
 * Infrastructure facts across the row: a 40% label column, values right-aligned
 * to the row's edge and a 24px action column, in 25px rows (spec `.c3kv`).
 * Pass `actionColumn` so the column is kept when no fact has an action.
 */
export const INFRA_FACTS_GRID = 'auto-rows-[25px] grid-cols-[40%_minmax(0,1fr)_24px] gap-y-0';

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

/** The widest a status column grows for a long word: 200px, or 30% of a narrower list. */
const STATUS_MAX = 200;
const STATUS_MAX_SHARE = 0.3;

/**
 * Grows a list's status column to its widest status word, so a long word in a
 * wide locale ("Κανένα συνδεδεμένο") is read whole and every row still lines up.
 * The configured width stays the minimum. The width lives in `--infra-status`
 * on the list, so a change re-renders no row.
 */
function useStatusColumnFit(list: RefObject<HTMLDivElement | null>, minimum: number) {
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      let widest = 0;
      for (const cell of element.querySelectorAll<HTMLElement>('[data-slot="infra-status"]')) {
        const indicator = cell.firstElementChild as HTMLElement | null;
        const word = indicator?.lastElementChild as HTMLElement | null;
        // A narrow row shows only the mark here; its word is on the sub-line.
        if (!indicator || !word || word.clientWidth <= 1) continue;
        widest = Math.max(
          widest,
          indicator.getBoundingClientRect().width - word.clientWidth + word.scrollWidth,
        );
      }
      const cap = Math.max(minimum, Math.min(STATUS_MAX, element.clientWidth * STATUS_MAX_SHARE));
      const width = Math.min(cap, Math.max(minimum, Math.ceil(widest)));
      if (element.style.getPropertyValue('--infra-status') !== `${width}px`) {
        element.style.setProperty('--infra-status', `${width}px`);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    fit();
    const mutations = new MutationObserver(schedule);
    mutations.observe(element, { subtree: true, childList: true, characterData: true });
    const resizes =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    resizes?.observe(element);
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      frame = -1;
      mutations.disconnect();
      resizes?.disconnect();
    };
  }, [list, minimum]);
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
  const list = useRef<HTMLDivElement>(null);
  useStatusColumnFit(list, status);
  return (
    <InfraColumnsContext.Provider value={columns}>
      <div
        ref={list}
        className={cn('@container/infra flex min-w-0 flex-col', className)}
        data-slot="infra-list"
      >
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

/**
 * Under 480px the row keeps its name: the status word moves from its column to
 * the start of the sub-line (the mark keeps a 16px column), the meta column is
 * already gone, and the hover actions fold into one always-shown "more"
 * button (InfraRowMenu), so the dot and the pinned action keep their columns.
 */
const NARROW_STATUS =
  'flex shrink-0 overflow-hidden @max-[480px]/infra:w-4! @max-[480px]/infra:[&_[data-slot=status-indicator]>:last-child]:sr-only';
const NARROW_ACTIONS =
  '@max-[480px]/infra:[&>[data-slot=list-row-actions]]:w-[26px]! @max-[480px]/infra:[&>[data-slot=list-row-actions]]:opacity-100';
/**
 * Under 480px the name and sub-line wrap whole rather than cut ("セッションと…"), and
 * Japanese wraps between phrases ("ツールゲートウ / ェイ" no longer).
 */
const NARROW_TEXT =
  '@max-[480px]/infra:[&_[data-slot=list-row-text]>span]:whitespace-normal @max-[480px]/infra:[&_[data-slot=list-row-text]>span]:break-words @max-[480px]/infra:[&_[data-slot=list-row-text]>span]:[word-break:auto-phrase]';
/**
 * Under 15rem (a 260px window at 150%) the text column would be narrower than a word
 * ("Εγκατάσταση"), so the row gives the text its other room: the decorative icon goes,
 * the gaps tighten, and the status mark leaves its column. The status word is already
 * at the start of the sub-line, and the column's label is still read.
 */
const NARROW_ROOM =
  '@max-[15rem]/infra:gap-1.5 @max-[15rem]/infra:[&>[data-slot=list-row-icon]]:hidden @max-[15rem]/infra:[&>[data-slot=infra-status]]:sr-only!';

/** Shift+F10 (or the menu key) anywhere in a row opens its ⋯, as the keyboard opens a menu. */
function openInfraRowMenu(event: KeyboardEvent<HTMLDivElement>) {
  if (!isRowMenuKey(event)) return;
  const triggers = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[aria-haspopup=menu]'),
  ].filter((trigger) => trigger.offsetParent !== null && !trigger.matches(':disabled'));
  const trigger = triggers[triggers.length - 1];
  if (!trigger) return;
  event.preventDefault();
  trigger.focus();
  trigger.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
  );
}

/** A two-line inventory row with fixed status, meta and action columns. */
export const InfraRow = memo(
  forwardRef<HTMLDivElement, InfraRowProps>(function InfraRow(
    {
      icon,
      title,
      description,
      status,
      meta,
      actions,
      primaryAction,
      details,
      className,
      onKeyDown,
      ...rest
    },
    ref,
  ) {
    const columns = useContext(InfraColumnsContext);
    const metaTitle = typeof meta === 'string' ? meta : undefined;
    const text = typeof description === 'string' ? withAddressBreaks(description) : description;
    // The word is read once, from the status column. A narrow row shows it again here as
    // generated content, so it is neither announced nor found twice.
    const subLine = status ? (
      <>
        <span
          aria-hidden="true"
          data-label={status.label}
          className={cn(
            'mr-2 hidden before:content-[attr(data-label)] @max-[480px]/infra:inline',
            statusWordClass(status.tone),
          )}
        />
        {/* A line may break after the status word, not inside the next one. */}
        <wbr />
        {text}
      </>
    ) : (
      text
    );
    return (
      <div className="min-w-0" role="listitem">
        <ListRow
          ref={ref}
          layout="stacked"
          icon={icon}
          title={typeof title === 'string' ? withAddressBreaks(title) : title}
          description={subLine}
          columns={
            <>
              <span
                className={NARROW_STATUS}
                data-slot="infra-status"
                style={{ width: `var(--infra-status, ${columns.status}px)` }}
              >
                {status ? (
                  <StatusIndicator
                    className="text-caption"
                    label={status.label}
                    tone={status.tone}
                  />
                ) : null}
              </span>
              {columns.meta ? (
                <span
                  className="hidden shrink-0 items-center justify-end gap-1.5 overflow-hidden text-caption text-muted-foreground @lg/infra:flex"
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
          className={cn(NARROW_TEXT, NARROW_ROOM, columns.hover && NARROW_ACTIONS, className)}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (!event.defaultPrevented) openInfraRowMenu(event);
          }}
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
