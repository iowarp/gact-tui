import {
  ActivityIcon,
  CircleCheckIcon,
  Clock3Icon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { HelpIcon } from '@/lib/icon-vocabulary';
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
        ? 'size-4 text-media-backdrop [filter:drop-shadow(0_0_1px_var(--media-foreground))_drop-shadow(0_0_1px_var(--media-foreground))]'
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
            iconClassName('text-status-running-foreground'),
            'animate-spin motion-reduce:animate-none',
          )}
        />
      ) : stages.overall === 'waiting' ? (
        <Clock3Icon
          aria-hidden="true"
          className={iconClassName('text-status-running-foreground')}
        />
      ) : stages.overall === 'failed' ? (
        <TriangleAlertIcon aria-hidden="true" className={iconClassName('text-destructive')} />
      ) : stages.overall === 'unknown' ? (
        // Not the running color: nothing is in motion, the state simply cannot be read.
        <HelpIcon aria-hidden="true" className={iconClassName('text-muted-foreground')} />
      ) : (
        <ActivityIcon
          aria-hidden="true"
          className={iconClassName('text-status-supported-foreground')}
        />
      )}
    </span>
  );
}

/** Expanded upload, conversion, and workspace-copy status used in attachment hover cards. */
export function ResourcePipelineStatusLines({ stages }: { stages: ResourcePipelineStages }) {
  return (
    <div className="space-y-1.5">
      <ResourceStageLine stage={stages.upload} />
      <ResourceStageLine stage={stages.conversion} />
      <ResourceStageLine stage={stages.workspaceCopy} />
    </div>
  );
}

function ResourceStageLine({ stage }: { stage: ResourcePipelineStage }) {
  const icon =
    stage.kind === 'active' ? (
      <LoaderCircleIcon
        aria-hidden="true"
        className="size-3.5 animate-spin text-status-running-foreground motion-reduce:animate-none"
      />
    ) : stage.kind === 'complete' ? (
      <CircleCheckIcon aria-hidden="true" className="size-3.5 text-status-supported-foreground" />
    ) : stage.kind === 'failed' ? (
      <TriangleAlertIcon aria-hidden="true" className="size-3.5 text-destructive" />
    ) : stage.kind === 'unknown' ? (
      <HelpIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
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
