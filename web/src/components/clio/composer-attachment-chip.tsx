import { createElement, type HTMLAttributes } from 'react';
import type { ResourceUploadProgress } from '@/lib/upload-workspace-resources';
import { formatBytes } from '@/lib/format';
import { Progress } from '@/components/ui/progress';
import { RetryIcon, RemoveIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import type { ResourcePipelineStages } from './resource-availability';
import { referenceKindIcon } from './composer-reference-presentation';

const CHIP_ACTION =
  'relative z-10 grid size-[18px] shrink-0 place-items-center rounded-[4px] text-muted-foreground outline-none hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring';

/**
 * A pending file in the composer: the spec's 24px chip with the file's type
 * glyph, its name and size. Transfer and conversion add a word and a hairline
 * of real progress; completion is never synthesized.
 */
export function ComposerAttachmentChip({
  name,
  mediaType,
  size,
  progress,
  stages,
  onOpen,
  onRemove,
  onRetry,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  name: string;
  mediaType: string;
  size?: number;
  progress?: ResourceUploadProgress;
  stages: ResourcePipelineStages;
  onOpen: () => void;
  onRemove: () => void;
  onRetry?: () => void;
}) {
  const uploading = stages.upload.kind === 'active';
  const converting = stages.conversion.kind === 'active';
  const failed = stages.upload.kind === 'failed';
  const bytes = progress?.filename === name ? progress : undefined;
  const percentage =
    bytes && bytes.total > 0
      ? Math.max(0, Math.min(100, Math.round((bytes.loaded / bytes.total) * 100)))
      : undefined;
  const inFlight = uploading || converting;
  const status = uploading
    ? bytes && bytes.loaded < bytes.total
      ? `Uploading ${percentage ?? 0}%`
      : bytes
        ? 'Registering file'
        : 'Starting upload'
    : converting
      ? 'Converting'
      : failed
        ? 'Upload failed'
        : undefined;
  return (
    <div
      {...props}
      data-slot="composer-attachment-chip"
      aria-busy={inFlight}
      className={cn(
        'relative inline-flex h-6 max-w-64 min-w-0 items-center gap-1.5 overflow-hidden rounded-[6px] bg-muted pr-0.5 pl-2 text-[12.5px] text-foreground',
        failed && 'ring-1 ring-destructive/40 ring-inset',
        className,
      )}
    >
      {/* The spec chip draws no status mark; the full pipeline state stays announced. */}
      <span role="img" aria-label={`Attachment status: ${stages.overallLabel}`} className="sr-only" />
      <button
        type="button"
        aria-label={`Open ${name}`}
        title={failed && stages.upload.detail ? `${name}: ${stages.upload.detail}` : name}
        onClick={onOpen}
        className="flex min-w-0 items-center gap-1.5 outline-none after:absolute after:inset-0 after:rounded-[6px] after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring"
      >
        {createElement(referenceKindIcon('workspace_file', name, mediaType), {
          'aria-hidden': true,
          className: 'size-3 shrink-0 text-muted-foreground',
        })}
        <span className="min-w-0 truncate">{name}</span>
        {status ? (
          <span
            className={cn(
              'shrink-0 text-[11px] tabular-nums',
              failed ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {status}
          </span>
        ) : size !== undefined ? (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
            {formatBytes(size)}
          </span>
        ) : null}
      </button>
      {onRetry ? (
        <button
          type="button"
          aria-label={`Retry upload for ${name}`}
          title="Retry upload"
          onClick={onRetry}
          className={CHIP_ACTION}
        >
          <RetryIcon className="size-3" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={`Remove ${name}`}
        title={inFlight ? 'Cancel upload and remove attachment' : 'Remove attachment'}
        onClick={onRemove}
        className={CHIP_ACTION}
      >
        <RemoveIcon className="size-3" />
      </button>
      {inFlight ? (
        <Progress
          aria-label={`${uploading ? 'Upload' : 'Conversion'} progress for ${name}`}
          value={uploading && percentage !== undefined && percentage < 100 ? percentage : undefined}
          className="absolute inset-x-0 bottom-0 h-0.5 rounded-none bg-transparent"
        />
      ) : null}
    </div>
  );
}
