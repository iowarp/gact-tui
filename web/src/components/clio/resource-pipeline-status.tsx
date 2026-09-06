import {
  ActivityIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  Clock3Icon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { ResourcePipelineStage, ResourcePipelineStages } from './resource-availability';
import { cn } from '@/lib/utils';

/** One compact icon summarizing the upload and conversion pipeline. */
export function ResourcePipelineSummaryIcon({
  overlay = false,
  stages,
}: {
  overlay?: boolean;
  stages: ResourcePipelineStages;
}) {
  const iconClassName = (statusClassName: string) =>
    cn(
      overlay
        ? 'size-4 text-black [filter:drop-shadow(0_0_1px_white)_drop-shadow(0_0_1px_white)]'
        : 'size-3',
      !overlay && statusClassName,
    );

  return (
    <span
      aria-label={`Attachment status: ${stages.overallLabel}`}
      className="inline-flex shrink-0 items-center"
      data-overlay={overlay || undefined}
      role="img"
    >
      {stages.overall === 'active' ? (
        <LoaderCircleIcon
          aria-hidden="true"
          className={cn(
            iconClassName('text-amber-600 dark:text-amber-400'),
            'animate-spin motion-reduce:animate-none',
          )}
        />
      ) : stages.overall === 'waiting' ? (
        <Clock3Icon
          aria-hidden="true"
          className={iconClassName('text-amber-600 dark:text-amber-400')}
        />
      ) : stages.overall === 'failed' ? (
        <TriangleAlertIcon aria-hidden="true" className={iconClassName('text-destructive')} />
      ) : stages.overall === 'unknown' ? (
        // Not amber: nothing is in motion, the state simply cannot be read.
        <CircleHelpIcon aria-hidden="true" className={iconClassName('text-muted-foreground')} />
      ) : (
        <ActivityIcon
          aria-hidden="true"
          className={iconClassName('text-emerald-600 dark:text-emerald-400')}
        />
      )}
    </span>
  );
}

/** Expanded two-line upload and conversion status used in attachment hover cards. */
export function ResourcePipelineStatusLines({ stages }: { stages: ResourcePipelineStages }) {
  return (
    <div className="space-y-1.5">
      <ResourceStageLine stage={stages.upload} />
      <ResourceStageLine stage={stages.conversion} />
    </div>
  );
}

function ResourceStageLine({ stage }: { stage: ResourcePipelineStage }) {
  const icon =
    stage.kind === 'active' ? (
      <LoaderCircleIcon
        aria-hidden="true"
        className="size-3.5 animate-spin text-amber-600 motion-reduce:animate-none dark:text-amber-400"
      />
    ) : stage.kind === 'complete' ? (
      <CircleCheckIcon
        aria-hidden="true"
        className="size-3.5 text-emerald-600 dark:text-emerald-400"
      />
    ) : stage.kind === 'failed' ? (
      <TriangleAlertIcon aria-hidden="true" className="size-3.5 text-destructive" />
    ) : stage.kind === 'unknown' ? (
      <CircleHelpIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
    ) : (
      <Clock3Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
    );

  return (
    <div
      aria-label={`${stage.name} status: ${stage.label}`}
      className="flex items-center gap-2 text-xs"
      role="status"
    >
      {icon}
      <span className="font-medium">{stage.name}</span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-muted-foreground">
        <span>{stage.label}</span>
        {stage.detail ? <span className="min-w-0">{stage.detail}</span> : null}
      </span>
    </div>
  );
}
