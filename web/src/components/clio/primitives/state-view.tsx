import { memo, type ComponentType, type ReactNode, type SVGProps } from 'react';
import {
  BoxIcon,
  CircleAlertIcon,
  CircleOffIcon,
  FileIcon,
  FileQuestionIcon,
  FileWarningIcon,
  GitCompareArrowsIcon,
  GitCompareIcon,
  InboxIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { IconButton } from './icon-button';
import { RingSpinner } from './ring-spinner';

export type StateKind =
  | 'loading'
  | 'empty'
  | 'error'
  | 'unavailable'
  | 'too-large'
  | 'no-preview'
  | 'changed-elsewhere'
  /** A quiet fact in a flow (forked here, compacted here); not announced. */
  | 'marker';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const ICON: Record<Exclude<StateKind, 'loading'>, Icon> = {
  empty: InboxIcon,
  error: CircleAlertIcon,
  unavailable: CircleOffIcon,
  'too-large': FileWarningIcon,
  'no-preview': FileQuestionIcon,
  'changed-elsewhere': GitCompareArrowsIcon,
  marker: InfoIcon,
};

/** A viewer body's glyphs, as the frame spec draws them. */
const VIEWER_ICON: Record<Exclude<StateKind, 'loading'>, Icon> = {
  ...ICON,
  error: TriangleAlertIcon,
  'too-large': FileIcon,
  'no-preview': FileIcon,
  'changed-elsewhere': GitCompareIcon,
};

/** The loading skeleton's line widths in a viewer body. */
const VIEWER_SKELETON = ['70%', '100%', '85%', '60%', '100%'];

export interface StateAction {
  label: string;
  onClick: () => void;
  /** In a viewer body, an action with an icon is a named icon button. */
  icon?: ReactNode;
  disabled?: boolean;
  /** Catalog id of the key that runs it; a named icon shows it in its tooltip. */
  shortcut?: string;
}

export interface StateViewProps {
  kind: StateKind;
  /**
   * The one line: what is loading, missing, failed or held back. A marker's
   * line may carry a link; only a string line repeats itself on hover.
   */
  title: ReactNode;
  /**
   * The one action. `error` defaults its label to Retry, `unavailable` to
   * Why?. `changed-elsewhere` takes two (Keep current, Use mine).
   */
  action?: StateAction;
  secondaryAction?: StateAction;
  /**
   * A viewer body's named icon actions in order (Source, Open, Download), in
   * place of `action` and `secondaryAction`.
   */
  actions?: readonly StateAction[];
  /** A text link under the action (Details), for a page or a panel. */
  link?: StateAction;
  /** Supplemental facts after the line: a size, an extension, a time. */
  detail?: string;
  /**
   * `row` fits a 28px list row, `panel` a frame, `page` a whole view, and
   * `viewer` a file viewer's body under its frame bar: a quiet skeleton while
   * loading, otherwise a compact centered icon, line and up to two actions.
   */
  size?: 'row' | 'panel' | 'page' | 'viewer';
  icon?: Icon;
  /** A rendered glyph (a file-type icon) in place of `icon`. */
  glyph?: ReactNode;
  /** Optional content under the line (a step list during startup). */
  children?: ReactNode;
  className?: string;
}

/**
 * Every state that stands in for content: loading, empty, error,
 * unavailable, too large, no preview, changed elsewhere. Icon, one line, one
 * action; loading and failure announce themselves.
 */
export const StateView = memo(function StateView({
  kind,
  title,
  action,
  secondaryAction,
  actions,
  link,
  detail,
  size = 'panel',
  icon,
  glyph,
  children,
  className,
}: StateViewProps) {
  if (size === 'viewer')
    return (
      <ViewerState
        action={action}
        actions={actions}
        className={className}
        detail={detail}
        glyph={glyph}
        icon={icon}
        kind={kind}
        secondaryAction={secondaryAction}
        title={title}
      >
        {children}
      </ViewerState>
    );
  const IconComponent = icon ?? (kind === 'loading' ? null : ICON[kind]);
  const row = size === 'row';
  const live =
    kind === 'loading'
      ? ({ role: 'status', 'aria-live': 'polite', 'aria-busy': true } as const)
      : kind === 'error'
        ? ({ role: 'alert' } as const)
        : kind === 'marker'
          ? {}
          : ({ role: 'status' } as const);
  const actionLabel =
    action?.label ?? (kind === 'error' ? 'Retry' : kind === 'unavailable' ? 'Why?' : undefined);
  return (
    <div
      {...live}
      data-slot="state-view"
      data-kind={kind}
      data-size={size}
      className={cn(
        'flex min-w-0 text-muted-foreground',
        row
          ? 'h-7 items-center gap-2 px-2 text-[12.5px] whitespace-nowrap'
          : 'flex-col items-center justify-center gap-2.5 px-4 text-center text-[13px]',
        size === 'panel' && 'min-h-[170px] py-6',
        size === 'page' && 'min-h-[50vh] py-10',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid shrink-0 place-items-center',
          row ? 'size-4' : 'size-[22px]',
          kind === 'error' && 'text-destructive',
          kind === 'too-large' && 'text-warning',
        )}
      >
        {kind === 'loading' && !icon ? (
          // The activity rows' running ring (spec .spin, 12px), so a loading line reads as work in progress.
          <RingSpinner className={row ? 'size-3' : 'size-[18px]'} />
        ) : IconComponent ? (
          <IconComponent className={row ? 'size-[15px]' : 'size-[22px]'} />
        ) : (
          <BoxIcon className="size-[22px]" />
        )}
      </span>
      <span
        className={cn(
          'flex min-w-0',
          row ? 'items-baseline gap-2' : 'max-w-full flex-col items-center gap-1',
        )}
      >
        <span
          title={typeof title === 'string' ? title : undefined}
          className={cn(
            'min-w-0 max-w-full truncate',
            // A row's title says what failed; its technical detail gives way first.
            row && 'shrink-0',
            !row && 'text-foreground',
          )}
        >
          {title}
        </span>
        {detail ? (
          <span
            title={row ? detail : undefined}
            className={cn(
              row
                ? 'min-w-0 max-w-full truncate font-mono text-[11px] text-muted-foreground tabular-nums'
                : // A panel's explanation is a sentence: it wraps rather than hide its end.
                  'max-w-[36ch] text-[12px] leading-[1.4] text-balance',
            )}
          >
            {detail}
          </span>
        ) : null}
      </span>
      {children}
      {action ? (
        <span className={cn('flex shrink-0 items-center gap-2', row && 'ml-auto')}>
          {secondaryAction ? (
            <Button
              variant="outline"
              size={row ? 'xs' : 'default'}
              onClick={secondaryAction.onClick}
              data-slot="state-secondary-action"
            >
              {secondaryAction.label}
            </Button>
          ) : null}
          <Button
            variant={kind === 'changed-elsewhere' ? 'default' : 'outline'}
            size={row ? 'xs' : 'default'}
            disabled={action.disabled}
            onClick={action.onClick}
            className={cn(
              kind !== 'changed-elsewhere' && 'text-foreground',
              row && kind !== 'changed-elsewhere' && 'rounded-[7px] border-input',
            )}
          >
            {/* An action's own icon (or `null` for none) replaces Retry's. */}
            {action.icon !== undefined ? (
              action.icon
            ) : kind === 'error' ? (
              <RetryIcon aria-hidden="true" className={row ? 'size-3.5' : undefined} />
            ) : null}
            {actionLabel}
          </Button>
        </span>
      ) : null}
      {link && !row ? (
        <button
          type="button"
          disabled={link.disabled}
          onClick={link.onClick}
          className="rounded-sm text-[12px] text-accent-foreground underline underline-offset-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {link.label}
        </button>
      ) : null}
    </div>
  );
});

function liveRegion(kind: StateKind) {
  return kind === 'loading'
    ? ({ role: 'status', 'aria-live': 'polite', 'aria-busy': true } as const)
    : kind === 'error'
      ? ({ role: 'alert' } as const)
      : ({ role: 'status' } as const);
}

/** The spec's `.stt`: one look for every format's loading, failure and held-back body. */
function ViewerState({
  kind,
  title,
  action,
  secondaryAction,
  actions: listed,
  detail,
  icon,
  glyph,
  children,
  className,
}: Omit<StateViewProps, 'size'>) {
  if (kind === 'loading')
    return (
      <div
        {...liveRegion(kind)}
        aria-label={typeof title === 'string' ? title : undefined}
        data-kind={kind}
        data-size="viewer"
        data-slot="state-view"
        className={cn('flex w-full min-w-0 flex-col gap-2.5 p-3.5', className)}
      >
        <span className="sr-only">{title}</span>
        {VIEWER_SKELETON.map((width, index) => (
          <span
            // oxlint-disable-next-line react/no-array-index-key -- fixed placeholder lines
            key={index}
            aria-hidden="true"
            data-slot="skeleton"
            className="block h-[9px] rounded-[4px] bg-muted motion-safe:animate-pulse"
            style={{ width }}
          />
        ))}
        {children}
      </div>
    );
  const IconComponent = icon ?? VIEWER_ICON[kind];
  const retry =
    kind === 'error' && action && (action.label || 'Retry') === 'Retry'
      ? { ...action, label: 'Retry', icon: action.icon ?? <RetryIcon /> }
      : action;
  const actions =
    listed ?? [secondaryAction, retry].filter((entry): entry is StateAction => !!entry);
  return (
    <div
      {...liveRegion(kind)}
      data-kind={kind}
      data-size="viewer"
      data-slot="state-view"
      className={cn(
        'flex size-full min-h-[140px] min-w-0 flex-col items-center justify-center gap-[9px] px-4 py-6 text-center text-[12.5px] text-muted-foreground',
        className,
      )}
    >
      <span aria-hidden="true" className="grid shrink-0 place-items-center text-faint">
        {glyph ?? <IconComponent className="size-[26px]" />}
      </span>
      <span className="max-w-[min(100%,34rem)] px-3.5 text-[13px] font-medium text-balance break-words text-foreground">
        {title}
      </span>
      {detail ? (
        <span
          title={detail}
          className="line-clamp-4 max-w-[min(100%,256px)] text-[12px] leading-normal break-words text-muted-foreground"
        >
          {detail}
        </span>
      ) : null}
      {children}
      {actions.length ? (
        <span
          className={cn(
            'flex shrink-0 items-center',
            actions.every((entry) => entry.icon) ? 'gap-1' : 'gap-1.5',
          )}
        >
          {actions.map((entry) =>
            entry.icon ? (
              <IconButton
                key={entry.label}
                className={cn(
                  'size-[30px] shrink-0 rounded-[6px] text-muted-foreground hover:text-foreground [&_svg:not([class*=size-])]:size-5',
                )}
                disabled={entry.disabled}
                icon={entry.icon}
                label={entry.label}
                onClick={entry.onClick}
                shortcut={entry.shortcut}
              />
            ) : (
              <Button
                key={entry.label}
                className="h-auto rounded-[6px] px-[9px] py-1 text-[11.5px] font-normal text-foreground"
                disabled={entry.disabled}
                onClick={entry.onClick}
                size="xs"
                variant="secondary"
              >
                {entry.label}
              </Button>
            ),
          )}
        </span>
      ) : null}
    </div>
  );
}
