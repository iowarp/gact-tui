import { memo, type ComponentType, type ReactNode, type SVGProps } from 'react';
import {
  BoxIcon,
  CircleAlertIcon,
  CircleOffIcon,
  FileQuestionIcon,
  FileWarningIcon,
  GitCompareArrowsIcon,
  InboxIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';

export type StateKind =
  | 'loading'
  | 'empty'
  | 'error'
  | 'unavailable'
  | 'too-large'
  | 'no-preview'
  | 'changed-elsewhere';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const ICON: Record<Exclude<StateKind, 'loading'>, Icon> = {
  empty: InboxIcon,
  error: CircleAlertIcon,
  unavailable: CircleOffIcon,
  'too-large': FileWarningIcon,
  'no-preview': FileQuestionIcon,
  'changed-elsewhere': GitCompareArrowsIcon,
};

export interface StateAction {
  label: string;
  onClick: () => void;
}

export interface StateViewProps {
  kind: StateKind;
  /** The one line: what is loading, missing, failed or held back. */
  title: string;
  /**
   * The one action. `error` defaults its label to Retry, `unavailable` to
   * Why?. `changed-elsewhere` takes two (Keep current, Use mine).
   */
  action?: StateAction;
  secondaryAction?: StateAction;
  /** Supplemental facts after the line: a size, an extension, a time. */
  detail?: string;
  /** `row` fits a 28px list row, `panel` a frame, `page` a whole view. */
  size?: 'row' | 'panel' | 'page';
  icon?: Icon;
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
  detail,
  size = 'panel',
  icon,
  children,
  className,
}: StateViewProps) {
  const IconComponent = icon ?? (kind === 'loading' ? null : ICON[kind]);
  const row = size === 'row';
  const live =
    kind === 'loading'
      ? ({ role: 'status', 'aria-live': 'polite', 'aria-busy': true } as const)
      : kind === 'error'
        ? ({ role: 'alert' } as const)
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
          ? 'h-7 items-center gap-2 px-1.5 text-[12.5px] whitespace-nowrap'
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
          <Spinner className={cn(row ? 'size-3.5' : 'size-[18px]', 'motion-reduce:animate-none')} />
        ) : IconComponent ? (
          <IconComponent className={row ? 'size-3.5' : 'size-[22px]'} />
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
          title={title}
          className={cn('min-w-0 max-w-full truncate', !row && 'text-foreground')}
        >
          {title}
        </span>
        {detail ? (
          <span
            title={detail}
            className={cn(
              'min-w-0 max-w-full truncate',
              row
                ? 'shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums'
                : 'text-[12px]',
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
            >
              {secondaryAction.label}
            </Button>
          ) : null}
          <Button
            variant={kind === 'changed-elsewhere' ? 'default' : 'outline'}
            size={row ? 'xs' : 'default'}
            onClick={action.onClick}
          >
            {kind === 'error' ? <RetryIcon aria-hidden="true" /> : null}
            {actionLabel}
          </Button>
        </span>
      ) : null}
    </div>
  );
});
