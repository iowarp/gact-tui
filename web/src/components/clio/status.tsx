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
  RotateCcwIcon,
  ShieldQuestionIcon,
  WifiOffIcon,
  XCircleIcon,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ClioStatusValue =
  | StreamState
  | ToolState
  | RunState
  | 'healthy'
  | 'degraded'
  | 'unavailable';
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const statusPresentation: Record<
  ClioStatusValue,
  { label: string; icon: Icon; className: string }
> = {
  connecting: {
    label: 'Connecting',
    icon: PlugZapIcon,
    className: 'text-info-foreground dark:text-info border-info/30 bg-info/10',
  },
  live: {
    label: 'Live',
    icon: PlugZapIcon,
    className: 'text-success border-success/30 bg-success/10',
  },
  reconnecting: {
    label: 'Reconnecting',
    icon: RotateCcwIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
  gapped: {
    label: 'Stream gap',
    icon: CircleAlertIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
  offline: {
    label: 'Offline',
    icon: WifiOffIcon,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  queued: {
    label: 'Queued',
    icon: Clock3Icon,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  running: {
    label: 'Running',
    icon: LoaderCircleIcon,
    className: 'text-info-foreground dark:text-info border-info/30 bg-info/10',
  },
  waiting_permission: {
    label: 'Permission needed',
    icon: ShieldQuestionIcon,
    className: 'text-action border-action/30 bg-action/10',
  },
  waiting_user: {
    label: 'Waiting for you',
    icon: PauseCircleIcon,
    className: 'text-action border-action/30 bg-action/10',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2Icon,
    className: 'text-success border-success/30 bg-success/10',
  },
  failed: {
    label: 'Failed',
    icon: XCircleIcon,
    className: 'text-destructive border-destructive/30 bg-destructive/10',
  },
  cancelled: {
    label: 'Cancelled',
    icon: BanIcon,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  interrupted: {
    label: 'Interrupted',
    icon: CircleAlertIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
  pending: {
    label: 'Pending',
    icon: CircleDashedIcon,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  succeeded: {
    label: 'Succeeded',
    icon: CheckCircle2Icon,
    className: 'text-success border-success/30 bg-success/10',
  },
  denied: {
    label: 'Denied',
    icon: BanIcon,
    className: 'text-destructive border-destructive/30 bg-destructive/10',
  },
  healthy: {
    label: 'Healthy',
    icon: CheckCircle2Icon,
    className: 'text-success border-success/30 bg-success/10',
  },
  degraded: {
    label: 'Degraded',
    icon: CircleAlertIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
  unavailable: {
    label: 'Unavailable',
    icon: CircleDashedIcon,
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  unknown: {
    label: 'Unknown',
    icon: CircleAlertIcon,
    className: 'text-warning border-warning/30 bg-warning/10',
  },
};

export interface ClioStatusProps {
  value: ClioStatusValue;
  label?: string;
  detail?: string;
  className?: string;
}

export function ClioStatus({ value, label, detail, className }: ClioStatusProps) {
  const presentation = statusPresentation[value];
  const Icon = presentation.icon;
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
          (value === 'running' || value === 'connecting') && 'motion-safe:animate-spin',
        )}
      />
      <span>{label ?? presentation.label}</span>
      {detail ? <span className="sr-only">, {detail}</span> : null}
    </Badge>
  );
}
