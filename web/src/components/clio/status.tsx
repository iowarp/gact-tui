import type { StreamState, ToolState, RunState } from '@clio/core/v3';
import {
  BanIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDashedIcon,
  Clock3Icon,
  LoaderCircleIcon,
  PauseCircleIcon,
  PlugZapIcon,
  ShieldQuestionIcon,
  WifiOffIcon,
  XCircleIcon,
  OctagonIcon,
} from 'lucide-react';
import { RetryIcon } from '@/lib/icon-vocabulary';
import type { ComponentType, SVGProps } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { t } from '@lingui/core/macro';

export type ClioStatusValue =
  | StreamState
  | ToolState
  | RunState
  | 'healthy'
  | 'degraded'
  | 'unavailable';
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Run states read the science-state tokens (running, supported, superseded) so
 * a task row, a railroad node and a study node say the same thing in color as
 * in words. Failures stay `destructive`; connection health keeps its own tones.
 */
const statusPresentation: Record<
  ClioStatusValue,
  { label: string; icon: Icon; className: string }
> = {
  connecting: {
    label: t`Connecting`,
    icon: PlugZapIcon,
    className: 'text-info-foreground dark:text-info border-info/30 bg-info/10',
  },
  live: {
    label: t`Live`,
    icon: PlugZapIcon,
    className: 'text-success border-success/30 bg-success/10',
  },
  reconnecting: {
    label: t`Reconnecting`,
    icon: RetryIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
  gapped: {
    label: t`Stream gap`,
    icon: CircleAlertIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
  offline: {
    label: t`Offline`,
    icon: WifiOffIcon,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  queued: {
    label: t`Queued`,
    icon: Clock3Icon,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  running: {
    label: t`Running`,
    icon: LoaderCircleIcon,
    className:
      'text-status-running-foreground border-status-running-foreground/25 bg-status-running',
  },
  stopping: {
    label: t`Stopping`,
    icon: LoaderCircleIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
  stopped: {
    label: t`Stopped`,
    icon: PauseCircleIcon,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  cancellation_requested: {
    label: t`Cancellation requested`,
    icon: LoaderCircleIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
  task_state_uncertain: {
    label: t`Needs inspection`,
    icon: CircleAlertIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
  recovering: {
    label: t`Recovering`,
    icon: RetryIcon,
    className:
      'text-status-running-foreground border-status-running-foreground/25 bg-status-running',
  },
  pause_requested: {
    label: t`Pause requested`,
    icon: PauseCircleIcon,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  paused: {
    label: t`Paused`,
    icon: PauseCircleIcon,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  yielded: {
    label: t`Yielded`,
    icon: CircleDashedIcon,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  recovery_required: {
    label: t`Needs inspection`,
    icon: CircleAlertIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
  waiting_permission: {
    label: t`Permission needed`,
    icon: ShieldQuestionIcon,
    className: 'text-action border-action/30 bg-action/10',
  },
  waiting_user: {
    label: t`Waiting for you`,
    icon: PauseCircleIcon,
    className: 'text-action border-action/30 bg-action/10',
  },
  completed: {
    label: t`Completed`,
    icon: CheckCircle2Icon,
    className:
      'text-status-supported-foreground border-status-supported-foreground/25 bg-status-supported',
  },
  failed: {
    label: t`Failed`,
    icon: XCircleIcon,
    className: 'text-destructive border-destructive/30 bg-destructive/10',
  },
  cancelled: {
    label: t`Cancelled`,
    icon: BanIcon,
    className:
      'text-status-superseded-foreground border-status-superseded-foreground/25 bg-status-superseded',
  },
  interrupted: {
    label: t`Interrupted`,
    icon: OctagonIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
  pending: {
    label: t`Pending`,
    icon: CircleDashedIcon,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  succeeded: {
    label: t`Succeeded`,
    icon: CheckCircle2Icon,
    className:
      'text-status-supported-foreground border-status-supported-foreground/25 bg-status-supported',
  },
  denied: {
    label: t`Denied`,
    icon: BanIcon,
    className: 'text-destructive border-destructive/30 bg-destructive/10',
  },
  healthy: {
    label: t`Healthy`,
    icon: CheckCircle2Icon,
    className: 'text-success border-success/30 bg-success/10',
  },
  degraded: {
    label: t`Degraded`,
    icon: CircleAlertIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
  unavailable: {
    label: t`Unavailable`,
    icon: CircleDashedIcon,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  unknown: {
    label: t`Unknown`,
    icon: CircleAlertIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
};

/** The single typed label for a status value, for surfaces that render it as text. */
// The label table and the badge that renders it stay one owner.
// oxlint-disable-next-line react/only-export-components
export function clioStatusLabel(value: ClioStatusValue): string {
  return statusPresentation[value].label;
}

export interface ClioStatusProps {
  value: ClioStatusValue;
  label?: string;
  detail?: string;
  className?: string;
  compact?: boolean;
  /**
   * Suppress the native `title` tooltip this component renders by default.
   * Set this when the caller wraps `ClioStatus` in its own richer Tooltip
   * (e.g. one disclosing endpoint/transport/version detail) — without it,
   * the native browser tooltip and the custom one would both appear,
   * stacked on top of each other.
   */
  suppressNativeTitle?: boolean;
}

export function ClioStatus({
  value,
  label,
  detail,
  className,
  compact = false,
  suppressNativeTitle = false,
}: ClioStatusProps) {
  const presentation = statusPresentation[value];
  const Icon = presentation.icon;
  const accessibleLabel = label ?? presentation.label;
  if (compact)
    return (
      <span
        aria-label={accessibleLabel}
        className={cn(
          'inline-flex size-5 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          presentation.className.split(' ').filter((value) => value.startsWith('text-')),
          className,
        )}
        role="status"
        title={
          suppressNativeTitle
            ? undefined
            : detail
              ? `${accessibleLabel}: ${detail}`
              : accessibleLabel
        }
      >
        <Icon
          aria-hidden="true"
          className={cn(
            'size-4',
            (value === 'running' || value === 'connecting') && 'motion-safe:animate-spin-steps',
          )}
        />
        <span className="sr-only">{accessibleLabel}</span>
      </span>
    );
  return (
    <Badge
      variant="outline"
      className={cn('gap-1.5 rounded-md px-2 py-1 font-medium', presentation.className, className)}
      title={detail}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'size-3.5',
          (value === 'running' || value === 'connecting') && 'motion-safe:animate-spin-steps',
        )}
      />
      <span>{accessibleLabel}</span>
      {detail ? <span className="sr-only">, {detail}</span> : null}
    </Badge>
  );
}
