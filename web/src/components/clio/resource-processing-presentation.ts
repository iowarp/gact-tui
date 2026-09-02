/**
 * How a resource's structured-processing record reads on screen.
 *
 * The service's own state and representation tokens are wire vocabulary —
 * `not_started`, `structured_document`, `bounded_tools`. They belong in
 * requests, not in a sentence someone reads, so every surface that shows one
 * goes through the maps here, and a token this build does not recognise is
 * named as unknown with the raw token kept beside it rather than printed on its
 * own as if it were product copy.
 */

import type { ResourceDeliveryRepresentation, WorkspaceResourceProcessing } from '@clio/core/v3';

type ProcessingState = WorkspaceResourceProcessing['state'];

const PROCESSING_STATE_LABELS: Record<ProcessingState, string> = {
  not_started: 'Not started',
  submitted: 'Queued',
  processing: 'In progress',
  complete: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const DELIVERY_REPRESENTATION_LABELS: Record<ResourceDeliveryRepresentation, string> = {
  native: 'Original file',
  bounded_tools: 'Bounded tools',
  structured_document: 'Structured document',
  sandbox: 'Sandbox',
  retrieval: 'Retrieval',
  metadata_only: 'Metadata only',
};

/**
 * Names the structured-processing state. A resource that has never been sent to
 * a processor has no record at all, which reads the same as the service's own
 * `not_started`.
 */
export function processingStateLabel(state: string | undefined): string {
  if (!state) return PROCESSING_STATE_LABELS.not_started;
  return PROCESSING_STATE_LABELS[state as ProcessingState] ?? `Unknown (${state})`;
}

/** Names the form a resource reached the model in. */
export function deliveryRepresentationLabel(representation: string): string {
  if (!representation) return 'Unknown';
  return (
    DELIVERY_REPRESENTATION_LABELS[representation as ResourceDeliveryRepresentation] ??
    `Unknown (${representation})`
  );
}

/** Whether the most recent processing run ended without producing anything new. */
export function processingRefreshFailed(processing?: {
  state: string;
}): processing is { state: 'cancelled' | 'failed' } {
  return processing?.state === 'failed' || processing?.state === 'cancelled';
}

/**
 * The service's own explanation for a failed or cancelled run, when it gave
 * one. The record is an open bag, so only a real message is used; an empty bag
 * yields nothing and the caller says what it knows instead of inventing a
 * reason.
 */
export function processingFailureText(processing?: {
  cancellation?: Record<string, unknown>;
  failure?: Record<string, unknown>;
  state?: string;
}): string | undefined {
  const bag = processing?.state === 'cancelled' ? processing.cancellation : processing?.failure;
  const message = bag?.message ?? bag?.reason ?? bag?.detail;
  return typeof message === 'string' && message.trim() ? message : undefined;
}
