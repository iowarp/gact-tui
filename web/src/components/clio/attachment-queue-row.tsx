import type { ResourceUploadProgress } from '@/lib/upload-workspace-resources';
import { formatBytes } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RetryIcon, RemoveIcon } from '@/lib/icon-vocabulary';
import type { ResourcePipelineStages } from './resource-availability';
import { ResourcePipelineSummaryIcon } from './resource-pipeline-status';
import { FileIdentityRow } from './file-identity-row';
import type { HTMLAttributes } from 'react';

/** Reflect actual transfer bytes and pipeline states; never synthesize completion. */
export function AttachmentQueueRow({
  name,
  mediaType,
  size,
  progress,
  stages,
  onOpen,
  onRemove,
  onRetry,
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
  const bytes = progress?.filename === name ? progress : undefined;
  const percentage =
    bytes && bytes.total > 0
      ? Math.max(0, Math.min(100, Math.round((bytes.loaded / bytes.total) * 100)))
      : undefined;
  const inFlight = uploading || stages.conversion.kind === 'active';
  const label = uploading
    ? bytes && bytes.loaded < bytes.total
      ? `Uploading ${percentage ?? 0}%`
      : bytes
        ? 'Registering file'
        : 'Starting upload'
    : stages.conversion.kind === 'active'
      ? 'Converting'
      : stages.upload.label === 'Ready locally'
        ? 'Ready locally'
        : stages.overallLabel;
  return (
    <FileIdentityRow
      {...props}
      name={name}
      mediaType={mediaType}
      onOpen={onOpen}
      aria-busy={inFlight}
      metadata={
        <span className="flex items-center gap-2">
          {size === undefined ? null : <span>{formatBytes(size)}</span>}
          <ResourcePipelineSummaryIcon stages={stages} />
          <span>{label}</span>
        </span>
      }
      actions={
        <>
          {onRetry ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Retry upload for ${name}`}
              onClick={onRetry}
            >
              <RetryIcon className="size-3.5" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${name}`}
            title={inFlight ? 'Cancel upload and remove attachment' : 'Remove attachment'}
            onClick={onRemove}
          >
            <RemoveIcon className="size-3.5" />
          </Button>
        </>
      }
    >
      {inFlight ? (
        <Progress
          aria-label={`${uploading ? 'Upload' : 'Conversion'} progress for ${name}`}
          value={uploading && percentage !== undefined && percentage < 100 ? percentage : undefined}
          className="mt-2"
        />
      ) : null}
      {stages.upload.kind === 'failed' && stages.upload.detail ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {stages.upload.detail}
        </p>
      ) : null}
    </FileIdentityRow>
  );
}
