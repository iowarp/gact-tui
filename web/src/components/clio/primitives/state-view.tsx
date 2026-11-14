import { memo, type ComponentType, type MouseEvent, type ReactNode, type SVGProps } from 'react';
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
import { useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import { NamedTooltip } from './icon-button';
import { HeldKeyBadge } from './key-chip';
import { RingSpinner } from './ring-spinner';
import { t } from '@lingui/core/macro';

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

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Runs a state's action and, when the action replaces the state (Clear filters
 * brings the rows back) and takes the focused button with it, lands focus on
 * the first control of what replaced it, never on the page body.
 */
function keepingFocus(onClick: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    const container = event.currentTarget.closest('[data-slot="state-view"]')?.parentElement;
    onClick();
    if (!container) return;
    requestAnimationFrame(() => {
      if (!container.isConnected) return;
      const focused = document.activeElement;
      // A dialog's focus scope catches lost focus on itself, an ancestor of the list.
      const lost = !focused || !focused.isConnected || focused.contains(container);
      if (!lost) return;
      const target =
        container.querySelector<HTMLElement>('[tabindex="0"]') ??
        container.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    });
  };
}

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
  /** In a viewer body, its icon leads the button's label. */
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
   * A row's detail is a sentence, not a technical fact: it wraps whole under
   * the title instead of truncating first.
   */
  wrapDetail?: boolean;
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
  wrapDetail = false,
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
    action?.label ?? (kind === 'error' ? t`Retry` : kind === 'unavailable' ? t`Why?` : undefined);
  return (
    <div
      {...live}
      data-slot="state-view"
      data-kind={kind}
      data-size={size}
      className={cn(
        'flex min-w-0 text-muted-foreground',
        row
          ? // A row whose title would get too narrow beside its action wraps the action below.
            'min-h-7 flex-wrap items-start gap-x-2 gap-y-1 px-2 py-0.5 text-menu whitespace-nowrap'
          : 'flex-col items-center justify-center gap-2.5 px-4 text-center text-ui',
        size === 'panel' && 'min-h-[170px] py-6',
        size === 'page' && 'min-h-[50vh] py-10',
        className,
      )}
    >
      <span
        className={
          row
            ? // Centres the first line on the 24px action; later lines keep the icon on line 1.
              'flex min-w-0 grow basis-[12rem] items-start gap-2 py-[calc((1.5rem-1lh)/2)]'
            : 'contents'
        }
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid shrink-0 place-items-center',
            row ? 'h-[1lh] w-4' : 'size-[22px]',
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
            row && wrapDetail && 'flex-wrap gap-y-0',
          )}
        >
          <span
            title={typeof title === 'string' ? title : undefined}
            className={cn(
              'min-w-0 max-w-full',
              // A row's title is a sentence: in a narrow column it wraps between words rather
              // than hide its end, and its technical detail gives way first. A long word that still
              // doesn't fit is hyphenated at a syllable, not split at an arbitrary letter. Only in a
              // column under 12rem, where a long word can't fit whole; wider, words stay unbroken.
              row
                ? 'whitespace-normal [overflow-wrap:break-word] @max-[12rem]:hyphens-auto @max-[12rem]:[hyphenate-limit-chars:10_4_4]'
                : 'truncate',
              !row && 'text-foreground',
            )}
          >
            {title}
          </span>
          {detail ? (
            <span
              title={row && !wrapDetail ? detail : undefined}
              className={cn(
                row && wrapDetail
                  ? 'min-w-0 max-w-full font-mono text-caption text-muted-foreground tabular-nums whitespace-normal [overflow-wrap:break-word] @max-[12rem]:hyphens-auto @max-[12rem]:[hyphenate-limit-chars:10_4_4]'
                  : row
                    ? 'min-w-0 max-w-full shrink-[1000] truncate font-mono text-caption text-muted-foreground tabular-nums'
                    : // A panel's explanation is a sentence: it wraps rather than hide its end.
                      'max-w-[36ch] text-meta leading-[1.4] text-balance',
              )}
            >
              {detail}
            </span>
          ) : null}
        </span>
      </span>
      {children}
      {action ? (
        <span className={cn('flex shrink-0 items-center gap-2', row && 'ml-auto')}>
          {secondaryAction ? (
            <Button
              variant="outline"
              size={row ? 'xs' : 'default'}
              onClick={keepingFocus(secondaryAction.onClick)}
              data-slot="state-secondary-action"
            >
              {secondaryAction.label}
            </Button>
          ) : null}
          <Button
            variant={kind === 'changed-elsewhere' ? 'default' : 'outline'}
            size={row ? 'xs' : 'default'}
            disabled={action.disabled}
            onClick={keepingFocus(action.onClick)}
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
          className="rounded-sm text-meta text-accent-foreground underline underline-offset-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  // Callers pass the translated `Retry`; compare in the same language.
  const retryLabel = t`Retry`;
  const retry =
    kind === 'error' && action && (action.label || retryLabel) === retryLabel
      ? { ...action, label: retryLabel, icon: action.icon ?? <RetryIcon /> }
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
        'flex size-full min-h-[140px] min-w-0 flex-col items-center justify-center gap-[9px] px-4 py-6 text-center text-menu text-muted-foreground',
        className,
      )}
    >
      <span aria-hidden="true" className="grid shrink-0 place-items-center text-faint">
        {glyph ?? <IconComponent className="size-[26px]" />}
      </span>
      <span className="max-w-[min(100%,34rem)] px-3.5 text-ui font-medium text-balance break-words text-foreground">
        {title}
      </span>
      {detail ? (
        <span
          title={detail}
          className="line-clamp-4 max-w-[min(100%,256px)] text-meta leading-normal break-words text-muted-foreground"
        >
          {detail}
        </span>
      ) : null}
      {children}
      {actions.length ? (
        <span className="flex max-w-full flex-wrap items-center justify-center gap-1.5">
          {actions.map((entry) => (
            <ViewerStateAction key={entry.label} action={entry} />
          ))}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A viewer state's way out: the labelled small button every state uses ("↻ Retry",
 * "Download"), so no action is a bare glyph. A catalogued key shows in its tooltip,
 * as a held-key badge and in `aria-keyshortcuts`.
 */
function ViewerStateAction({ action }: { action: StateAction }) {
  const presentation = useShortcutPresentation(action.shortcut);
  const button = (
    <Button
      aria-keyshortcuts={presentation?.aria}
      className="relative h-auto shrink-0 gap-1 rounded-[6px] px-[9px] py-1 text-label font-normal whitespace-nowrap text-foreground [&_svg:not([class*=size-])]:size-3.5"
      data-slot="state-action"
      disabled={action.disabled}
      onClick={keepingFocus(action.onClick)}
      size="xs"
      variant="secondary"
    >
      {action.icon ?? null}
      {action.label}
      {action.shortcut ? <HeldKeyBadge id={action.shortcut} /> : null}
    </Button>
  );
  if (!action.shortcut) return button;
  return (
    <NamedTooltip label={action.label} shortcut={action.shortcut}>
      {button}
    </NamedTooltip>
  );
}
