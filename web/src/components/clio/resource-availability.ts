import type { MessageBlock, WorkspaceResource } from '@clio/core/v3';

type ResourceBlock = Extract<MessageBlock, { type: 'resource' }>;

export interface ResourceAvailability {
  className: string;
  detail: string;
  label: string;
}

export interface ResourcePipelineStage {
  detail?: string;
  kind: 'active' | 'complete' | 'failed' | 'waiting';
  label: string;
  name: 'Conversion' | 'Upload';
}

export interface ResourcePipelineStages {
  conversion: ResourcePipelineStage;
  overall: 'active' | 'complete' | 'failed' | 'waiting';
  overallLabel: string;
  upload: ResourcePipelineStage;
}

/** Describe whether a workspace resource is currently usable by the agent. */
export function resourceAvailability(
  resource?: WorkspaceResource,
  delivery?: ResourceBlock['delivery'],
): ResourceAvailability {
  if (!resource) {
    return {
      className: 'text-muted-foreground',
      detail: 'Availability could not be verified for this historical attachment.',
      label: 'Unknown',
    };
  }
  if (resource.state === 'uploading') {
    return {
      className: 'text-amber-600 dark:text-amber-400',
      detail: 'The attachment is still uploading and is not available to the agent yet.',
      label: 'Preparing',
    };
  }
  if (resource.state === 'failed' || resource.state === 'quarantined') {
    return {
      className: 'text-destructive',
      detail:
        resource.failure ||
        (resource.state === 'quarantined'
          ? 'The attachment was quarantined and is not available to the agent.'
          : 'The attachment is not available to the agent.'),
      label: 'Unavailable',
    };
  }

  if (delivery?.representation === 'native') {
    const evidence = delivery.evidence_source
      ? ` Capability evidence: ${delivery.evidence_source.replaceAll('_', ' ')}.`
      : '';
    return {
      className: 'text-emerald-600 dark:text-emerald-400',
      detail: `Ready; the selected model received the original attachment natively.${evidence}`,
      label: 'Ready',
    };
  }

  const processing = resource.processing;
  if (
    processing &&
    (processing.state === 'submitted' || processing.state === 'processing') &&
    !processing.derivatives_available
  ) {
    return {
      className: 'text-amber-600 dark:text-amber-400',
      detail: processing.progress
        ? `The original is retained; structured content is ${processing.progress}% ready for the agent.`
        : 'The original is retained; structured content is still being prepared for the agent.',
      label: 'Preparing',
    };
  }

  if (processing?.state === 'failed' && !processing.derivatives_available) {
    return {
      className: 'text-destructive',
      detail:
        typeof processing.failure.message === 'string'
          ? processing.failure.message
          : 'Structured conversion failed, so this attachment is not currently readable by the agent.',
      label: 'Unavailable',
    };
  }

  if (processing?.state === 'cancelled' && !processing.derivatives_available) {
    return {
      className: 'text-destructive',
      detail:
        'Structured conversion was cancelled before a usable derivative was created. The original remains available for preview.',
      label: 'Unavailable',
    };
  }

  if (!isDirectlyReadable(mediaType(resource)) && !processing?.derivatives_available) {
    return {
      className: 'text-amber-600 dark:text-amber-400',
      detail:
        'The original is retained and can be previewed, but no agent-readable conversion is available yet.',
      label: 'Needs processing',
    };
  }

  let detail = 'The original attachment is available to the agent.';
  if (processing?.derivatives_available) {
    detail =
      processing.state === 'cancelled'
        ? 'Ready; the agent can reuse a previously converted derivative. The latest refresh was cancelled.'
        : processing.state === 'failed'
          ? 'Ready; the agent can reuse a previously converted derivative. The latest refresh failed.'
          : processing.state === 'submitted' || processing.state === 'processing'
            ? 'Ready; the agent can reuse a previously converted derivative while a refresh runs.'
            : 'Ready; converted content is available to the agent.';
  }
  return { className: 'text-emerald-600 dark:text-emerald-400', detail, label: 'Ready' };
}

/** Resolve the two user-visible stages shared by submitted and queued attachments. */
export function resourcePipelineStages(
  resource: WorkspaceResource | undefined,
  availabilityLabel = resourceAvailability(resource).label,
): ResourcePipelineStages {
  const upload: ResourcePipelineStage =
    resource?.state === 'uploading'
      ? { kind: 'active', label: 'In progress', name: 'Upload' }
      : resource?.state === 'ready'
        ? { kind: 'complete', label: 'Complete', name: 'Upload' }
        : resource?.state === 'failed' || resource?.state === 'quarantined'
          ? { detail: resource.failure, kind: 'failed', label: 'Failed', name: 'Upload' }
          : { kind: 'waiting', label: 'Status unavailable', name: 'Upload' };

  const processing = resource?.processing;
  let conversion: ResourcePipelineStage;
  if (resource?.state === 'uploading') {
    conversion = { kind: 'waiting', label: 'Waiting for upload', name: 'Conversion' };
  } else if (processing?.derivatives_available || processing?.state === 'complete') {
    conversion = { kind: 'complete', label: 'Complete', name: 'Conversion' };
  } else if (processing?.state === 'processing') {
    conversion = {
      detail: processing.progress ? `${processing.progress}%` : undefined,
      kind: 'active',
      label: 'In progress',
      name: 'Conversion',
    };
  } else if (processing?.state === 'submitted') {
    conversion = { kind: 'waiting', label: 'Queued', name: 'Conversion' };
  } else if (processing?.state === 'failed' || processing?.state === 'cancelled') {
    conversion = {
      kind: 'failed',
      label: processing.state === 'cancelled' ? 'Cancelled' : 'Failed',
      name: 'Conversion',
    };
  } else if (availabilityLabel === 'Ready') {
    conversion = { kind: 'complete', label: 'Not required', name: 'Conversion' };
  } else {
    conversion = { kind: 'waiting', label: 'Waiting', name: 'Conversion' };
  }

  return summarizeResourcePipelineStages(upload, conversion);
}

/** Summarize upload and conversion stages into the single compact chip state. */
export function summarizeResourcePipelineStages(
  upload: ResourcePipelineStage,
  conversion: ResourcePipelineStage,
): ResourcePipelineStages {
  const stages = [upload, conversion];
  if (stages.some((stage) => stage.kind === 'active')) {
    return { conversion, overall: 'active', overallLabel: 'Processing', upload };
  }
  if (stages.some((stage) => stage.kind === 'failed')) {
    return { conversion, overall: 'failed', overallLabel: 'Unavailable', upload };
  }
  if (stages.some((stage) => stage.kind === 'waiting')) {
    return { conversion, overall: 'waiting', overallLabel: 'Waiting', upload };
  }
  return { conversion, overall: 'complete', overallLabel: 'Ready', upload };
}

function mediaType(resource: WorkspaceResource): string {
  return (resource.detected_mime || resource.claimed_mime).toLowerCase();
}

function isDirectlyReadable(value: string): boolean {
  return value.startsWith('text/') || value === 'application/json' || value.endsWith('+json');
}
