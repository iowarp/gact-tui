import type {
  MessageBlock,
  ResourceDeliveryRepresentation,
  WorkspaceResource,
} from '@clio/core/v3';

type ResourceBlock = Extract<MessageBlock, { type: 'resource' }>;

/**
 * Whether an attachment is usable by the agent right now.
 *
 * `state` is the decision; `label` and `detail` are only how it reads. Anything
 * that branches on availability branches on the state, so a reworded label can
 * never change behaviour.
 */
export type ResourceAvailabilityState =
  | 'needs_processing'
  | 'preparing'
  | 'ready'
  | 'unavailable'
  | 'unknown';

export interface ResourceAvailability {
  detail: string;
  label: string;
  state: ResourceAvailabilityState;
}

export interface ResourcePipelineStage {
  detail?: string;
  kind: 'active' | 'complete' | 'failed' | 'unknown' | 'waiting';
  label: string;
  name: 'Conversion' | 'Upload';
}

export interface ResourcePipelineStages {
  conversion: ResourcePipelineStage;
  overall: 'active' | 'complete' | 'failed' | 'unknown' | 'waiting';
  overallLabel: string;
  upload: ResourcePipelineStage;
}

const AVAILABILITY_LABELS: Record<ResourceAvailabilityState, string> = {
  needs_processing: 'Needs processing',
  preparing: 'Preparing',
  ready: 'Ready',
  unavailable: 'Unavailable',
  unknown: 'Unknown',
};

/**
 * Whether each representation the service can report means the agent can
 * actually read the attachment. Total over the union on purpose: a new
 * representation has to be answered here rather than falling through to a
 * media-type guess.
 */
const REPRESENTATION_READABILITY: Record<ResourceDeliveryRepresentation, boolean> = {
  native: true,
  bounded_tools: true,
  structured_document: true,
  sandbox: true,
  retrieval: true,
  metadata_only: false,
};

/** Describe whether a workspace resource is currently usable by the agent. */
export function resourceAvailability(
  resource?: WorkspaceResource,
  delivery?: ResourceBlock['delivery'],
): ResourceAvailability {
  if (!resource) {
    return availability(
      'unknown',
      'Availability could not be verified for this historical attachment.',
    );
  }
  if (resource.state === 'uploading') {
    return availability(
      'preparing',
      'The attachment is still uploading and is not available to the agent yet.',
    );
  }
  if (resource.state === 'failed' || resource.state === 'quarantined') {
    return availability(
      'unavailable',
      resource.failure ||
        (resource.state === 'quarantined'
          ? 'The attachment was quarantined and is not available to the agent.'
          : 'The attachment is not available to the agent.'),
    );
  }

  if (delivery?.representation === 'native') {
    const evidence = delivery.evidence_source
      ? ` Capability evidence: ${delivery.evidence_source.replaceAll('_', ' ')}.`
      : '';
    return availability(
      'ready',
      `Ready; the selected model received the original attachment natively.${evidence}`,
    );
  }

  const processing = resource.processing;
  if (
    processing &&
    (processing.state === 'submitted' || processing.state === 'processing') &&
    !processing.derivatives_available
  ) {
    return availability(
      'preparing',
      processing.state === 'submitted'
        ? 'Conversion queued.'
        : `${conversionActivityLabel(processing.stage)}.`,
    );
  }

  if (processing?.state === 'failed' && !processing.derivatives_available) {
    return availability(
      'unavailable',
      typeof processing.failure.message === 'string'
        ? processing.failure.message
        : 'Structured conversion failed, so this attachment is not currently readable by the agent.',
    );
  }

  if (processing?.state === 'cancelled' && !processing.derivatives_available) {
    return availability(
      'unavailable',
      'Structured conversion was cancelled before a usable derivative was created. The original remains available for preview.',
    );
  }

  if (!agentReadable(resource, delivery) && !processing?.derivatives_available) {
    return availability(
      'needs_processing',
      'The original is retained and can be previewed, but no agent-readable conversion is available yet.',
    );
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
  return availability('ready', detail);
}

/** Resolve the two user-visible stages shared by submitted and queued attachments. */
export function resourcePipelineStages(
  resource: WorkspaceResource | undefined,
  availabilityOf: ResourceAvailability = resourceAvailability(resource),
): ResourcePipelineStages {
  const upload: ResourcePipelineStage =
    resource?.state === 'uploading'
      ? { kind: 'active', label: 'In progress', name: 'Upload' }
      : resource?.state === 'ready'
        ? { kind: 'complete', label: 'Complete', name: 'Upload' }
        : resource?.state === 'failed' || resource?.state === 'quarantined'
          ? { detail: resource.failure, kind: 'failed', label: 'Failed', name: 'Upload' }
          : // No resource record, or a state this build does not recognise. That
            // is not the same as waiting for something.
            { kind: 'unknown', label: 'Status unavailable', name: 'Upload' };

  const processing = resource?.processing;
  let conversion: ResourcePipelineStage;
  if (resource?.state === 'uploading') {
    conversion = { kind: 'waiting', label: 'Waiting for upload', name: 'Conversion' };
  } else if (processing?.derivatives_available || processing?.state === 'complete') {
    conversion = { kind: 'complete', label: 'Complete', name: 'Conversion' };
  } else if (processing?.state === 'processing') {
    conversion = {
      detail:
        processing.progress_kind === 'measured' && processing.progress > 0
          ? `${processing.progress}%`
          : undefined,
      kind: 'active',
      label: conversionActivityLabel(processing.stage),
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
  } else if (availabilityOf.state === 'ready') {
    conversion = { kind: 'complete', label: 'Not required', name: 'Conversion' };
  } else if (availabilityOf.state === 'unknown') {
    conversion = { kind: 'unknown', label: 'Status unavailable', name: 'Conversion' };
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
  // Failure dominates: a stage that failed means the attachment is not usable,
  // whatever another stage is still doing.
  if (stages.some((stage) => stage.kind === 'failed')) {
    return { conversion, overall: 'failed', overallLabel: 'Unavailable', upload };
  }
  // An unknown stage outranks the ones that are merely in motion: reporting
  // progress for a pipeline whose other half cannot be read is a claim.
  if (stages.some((stage) => stage.kind === 'unknown')) {
    return { conversion, overall: 'unknown', overallLabel: 'Status unknown', upload };
  }
  if (stages.some((stage) => stage.kind === 'active')) {
    return { conversion, overall: 'active', overallLabel: 'Processing', upload };
  }
  if (stages.some((stage) => stage.kind === 'waiting')) {
    return { conversion, overall: 'waiting', overallLabel: 'Waiting', upload };
  }
  return { conversion, overall: 'complete', overallLabel: 'Ready', upload };
}

function availability(state: ResourceAvailabilityState, detail: string): ResourceAvailability {
  return { detail, label: AVAILABILITY_LABELS[state], state };
}

/** Human wording for processor phases; unknown converters remain generic. */
function conversionActivityLabel(stage?: string): string {
  switch (stage?.trim().toLowerCase()) {
    case 'starting':
    case 'initialization':
      return 'Starting';
    case 'docling':
    case 'conversion':
      return 'Converting';
    case 'export':
      return 'Preparing output';
    case 'grobid':
      return 'Enriching metadata';
    default:
      return 'In progress';
  }
}

/**
 * Whether the agent can read this attachment as it stands.
 *
 * The service's delivery decision is the answer where one exists — it is the
 * record of how the attachment actually reached a model, and it already
 * accounts for everything the client cannot see. The media-type check below is
 * the fallback for an attachment with no delivery record yet, which is every
 * attachment in the composer before a send.
 */
function agentReadable(resource: WorkspaceResource, delivery: ResourceBlock['delivery']): boolean {
  if (delivery) return REPRESENTATION_READABILITY[delivery.representation];
  return isDirectlyReadable(mediaType(resource));
}

function mediaType(resource: WorkspaceResource): string {
  return (resource.detected_mime || resource.claimed_mime).toLowerCase();
}

function isDirectlyReadable(value: string): boolean {
  return value.startsWith('text/') || value === 'application/json' || value.endsWith('+json');
}
