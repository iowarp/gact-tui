import {
  forwardRef,
  memo,
  useCallback,
  useState,
  type FocusEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { canDeferHoverControls } from '@/lib/hover-deferral';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { NamedTooltip } from './primitives/icon-button';
import { ListRow } from './primitives/list-row';

export type ActivityOutcomeTone = 'error' | 'warning' | 'muted';

export interface ActivityRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** The leading chevron (ActivityDisclosure); the 12px column stays when absent. */
  disclosure?: ReactNode;
  icon: ReactNode;
  /** What happened, in words: "Run command", "Delegate", "Thought for 6 seconds". */
  name: ReactNode;
  /** What it happened to: a path or command (mono) or a short phrase (`text`). */
  argument?: ReactNode;
  argumentStyle?: 'code' | 'text';
  /** Full argument on hover when it is cut. */
  argumentTitle?: string;
  /** An agent or entity the row opens (accent, underlined). */
  link?: ReactNode;
  /** A short result word: "exit 1", "12 hits", "waiting for you". */
  outcome?: ReactNode;
  outcomeTone?: ActivityOutcomeTone;
  outcomeTitle?: string;
  /** Extra marks between the text and the badge (an attention share). */
  marks?: ReactNode;
  /** Fixed 58px: a Tag such as Sandbox or Blocked. */
  badge?: ReactNode;
  /** Hover actions (44px): copy and open in the right pocket. */
  actions?: ReactNode;
  /** Fixed 44px mono, right-aligned. */
  elapsed?: ReactNode;
  /** Fixed 16px: StatusIndicator with `mark="glyph"`. */
  status?: ReactNode;
  /** Fixed 26px ⓘ; rows without one (thinking) keep the space. */
  info?: ReactNode;
  /** Opening or closing from the row (click on empty space, → and ←). */
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

const OUTCOME_TONE: Record<ActivityOutcomeTone, string> = {
  error: 'text-destructive',
  warning: 'text-warning',
  muted: 'text-muted-foreground',
};

const ROW_SELECTOR = '[data-activity-row]';

/**
 * One 28px line of agent activity in the transcript: a tool call, a delegate,
 * a thought, a task. Name, argument and outcome read left to right; badge,
 * hover actions, elapsed, status and ⓘ sit in fixed columns at the right edge
 * so rows line up and hover never moves anything. Nothing wraps; the argument
 * ends in an ellipsis.
 *
 * Keys with a row focused: ↑ ↓ move, → ← open and close, I technical details,
 * Alt+Enter the right pocket, Ctrl+C copy.
 */
export const ActivityRow = memo(
  forwardRef<HTMLDivElement, ActivityRowProps>(function ActivityRow(
    {
      disclosure,
      icon,
      name,
      argument,
      argumentStyle = 'code',
      argumentTitle,
      link,
      outcome,
      outcomeTone = 'error',
      outcomeTitle,
      marks,
      badge,
      actions,
      elapsed,
      status,
      info,
      onOpenChange,
      open,
      className,
      onKeyDown,
      onClick,
      onPointerEnter,
      onFocus,
      ...rest
    },
    ref,
  ) {
    // Hover actions mount when the pointer or focus first reaches the row, so a long
    // transcript does not carry every row's hidden buttons. Focus arms them before a
    // key press, so Ctrl+C and Alt+Enter still find them.
    const [armed, setArmed] = useState(() => !canDeferHoverControls());
    const handlePointerEnter = useCallback(
      (event: PointerEvent<HTMLDivElement>) => {
        onPointerEnter?.(event);
        setArmed(true);
      },
      [onPointerEnter],
    );
    const handleFocus = useCallback(
      (event: FocusEvent<HTMLDivElement>) => {
        onFocus?.(event);
        setArmed(true);
      },
      [onFocus],
    );
    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        const row = event.currentTarget;
        const fromRow = event.target === row;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const rows = Array.from(
            (
              row.closest('[data-slot="conversation-transcript"]') ?? document
            ).querySelectorAll<HTMLElement>(ROW_SELECTOR),
          );
          const next = rows[rows.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1)];
          if (next) {
            event.preventDefault();
            next.focus();
          }
        } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && onOpenChange) {
          if (open === (event.key === 'ArrowRight')) return;
          event.preventDefault();
          onOpenChange(event.key === 'ArrowRight');
        } else if (
          fromRow &&
          (event.key === 'i' || event.key === 'I') &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          const button = row.querySelector<HTMLElement>('[data-slot="activity-info"]');
          if (button) {
            event.preventDefault();
            button.click();
          }
        } else if (fromRow && event.key === 'Enter' && event.altKey) {
          const button = row.querySelector<HTMLElement>('[data-activity-action="open"]');
          if (button) {
            event.preventDefault();
            button.click();
          }
        } else if (fromRow && event.key === 'Enter' && onOpenChange) {
          event.preventDefault();
          onOpenChange(!open);
        } else if (fromRow && event.key === 'c' && (event.ctrlKey || event.metaKey)) {
          if (window.getSelection()?.toString()) return;
          const button = row.querySelector<HTMLElement>('[data-activity-action="copy"]');
          if (button) {
            event.preventDefault();
            button.click();
          }
        }
      },
      [onKeyDown, onOpenChange, open],
    );
    const handleClick = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || !onOpenChange) return;
        // Empty space on the row opens it; its links and buttons do their own thing.
        const target = event.target as HTMLElement;
        if (target.closest('button, a, [role="button"], [role="link"], input')) return;
        if (window.getSelection()?.toString()) return;
        onOpenChange(!open);
      },
      [onClick, onOpenChange, open],
    );
    return (
      <TooltipProvider delayDuration={450}>
        <ListRow
          ref={ref}
          variant="activity"
          tabIndex={-1}
          data-activity-row=""
          data-slot="activity-row"
          leading={disclosure}
          icon={icon}
          title={name}
          description={
            <>
              {link ? (
                // The agent name stays whole when it fits; if the row is narrower, it ends in …
                <span className="flex min-w-0 max-w-[min(16rem,100%)] shrink-0 items-center [&>*]:min-w-0">
                  {link}
                </span>
              ) : null}
              {argument !== undefined && argument !== null && argument !== '' ? (
                <span
                  data-slot="activity-argument"
                  title={argumentTitle}
                  className={cn(
                    'min-w-0 shrink truncate',
                    argumentStyle === 'code'
                      ? 'font-mono text-[11.5px] text-muted-foreground'
                      : 'text-[12.5px] text-foreground/85',
                  )}
                >
                  {argument}
                </span>
              ) : null}
              {outcome !== undefined && outcome !== null && outcome !== '' ? (
                <span
                  data-slot="activity-outcome"
                  title={outcomeTitle}
                  className={cn(
                    'flex shrink-0 items-center gap-2 text-[11.5px]',
                    OUTCOME_TONE[outcomeTone],
                  )}
                >
                  {outcome}
                </span>
              ) : null}
            </>
          }
          columns={
            marks ? <span className="flex shrink-0 items-center gap-1">{marks}</span> : undefined
          }
          badge={badge ?? null}
          actions={armed ? (actions ?? null) : null}
          meta={elapsed ?? null}
          status={status}
          info={info}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          onPointerEnter={actions && !armed ? handlePointerEnter : onPointerEnter}
          onFocus={actions && !armed ? handleFocus : onFocus}
          className={cn(onOpenChange && 'cursor-pointer', className)}
          {...rest}
        />
      </TooltipProvider>
    );
  }),
);

/** The leading chevron: opens and closes the row's body. */
export function ActivityDisclosure({
  open,
  label,
  disabled,
  onClick,
  asChildTrigger,
}: {
  open: boolean;
  /** "Expand Run command" / "Collapse Run command". */
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  /** Wrap for a Radix CollapsibleTrigger. */
  asChildTrigger?: (button: ReactNode) => ReactNode;
}) {
  const button = (
    <Button
      variant="ghost"
      aria-label={label}
      aria-expanded={open}
      disabled={disabled}
      onClick={onClick}
      data-slot="activity-disclosure"
      className="size-auto h-7 w-3 rounded-[3px] p-0 text-faint hover:bg-transparent hover:text-foreground disabled:opacity-0"
    >
      <ChevronRightIcon
        aria-hidden="true"
        className={cn('size-3 motion-safe:transition-transform', open && 'rotate-90')}
      />
    </Button>
  );
  return asChildTrigger ? asChildTrigger(button) : button;
}

/** The ⓘ: technical details for the row (command, input, result, timing). */
export const ActivityInfoButton = forwardRef<
  HTMLButtonElement,
  { label: string; onClick?: () => void; hint?: string }
>(function ActivityInfoButton(
  { label, onClick, hint = 'View command, input, result, and timing', ...rest },
  ref,
) {
  return (
    <NamedTooltip label={hint} side="top">
      <Button
        ref={ref}
        variant="ghost"
        aria-label={label}
        data-slot="activity-info"
        onClick={onClick}
        className="size-[26px] rounded-[5px] p-0 text-muted-foreground hover:bg-hover hover:text-foreground [&_svg]:size-3.5"
        {...rest}
      >
        <InfoIcon aria-hidden="true" />
      </Button>
    </NamedTooltip>
  );
});

/** The activity a row started (a delegate's calls, a script's calls), one step in. */
export function ActivityNest({
  children,
  label,
  hidden = 0,
  onShowAll,
  showAllLabel,
}: {
  children: ReactNode;
  label: string;
  /** Rows not shown; adds a "Show all N" line. */
  hidden?: number;
  onShowAll?: () => void;
  showAllLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="activity-nest"
      className="ml-[15px] min-w-0 border-l border-border pl-1.5"
    >
      {children}
      {hidden > 0 && onShowAll ? (
        <Button
          variant="ghost"
          onClick={onShowAll}
          className="h-auto rounded-[4px] px-2 py-1 text-[11.5px] font-normal text-muted-foreground hover:bg-hover hover:text-foreground"
        >
          {showAllLabel ?? `Show all ${hidden}`}
        </Button>
      ) : null}
    </div>
  );
}

/** The opened row: a framed body under the row, aligned with its name. */
export function ActivityBody({
  children,
  label,
  framed = true,
  className,
}: {
  children: ReactNode;
  label: string;
  /** Prose (a thought) reads unframed; results and files sit in a frame. */
  framed?: boolean;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      data-slot="activity-body"
      className={cn(
        'mt-0.5 mb-2 ml-[30px] min-w-0 text-[13px] [overflow-wrap:anywhere]',
        framed && 'overflow-hidden rounded-lg border border-border bg-background',
        className,
      )}
    >
      {children}
    </div>
  );
}
