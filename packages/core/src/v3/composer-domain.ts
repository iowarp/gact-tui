export type MessageDelivery = 'start' | 'steer' | 'auto';

export type ResourceDeliveryRepresentation =
  | 'native'
  | 'bounded_tools'
  | 'structured_document'
  | 'sandbox'
  | 'retrieval'
  | 'metadata_only';

export interface ResourceDeliveryDecision {
  representation: ResourceDeliveryRepresentation;
  evidence_source?: string;
  reason?: string;
}

export interface ComposerModelRef {
  provider_id: string;
  model_id: string;
  variant?: string;
}

export interface MessageBehavior {
  reasoning_effort: 'off' | 'low' | 'medium' | 'high' | 'xhigh';
  execution_mode: 'execute' | 'plan' | 'deep_research';
  confirmation_policy: 'ask' | 'auto-edits' | 'bypass' | 'ai-review' | 'spotter-ai';
}

export type ContextReferenceKind =
  | 'workspace_file'
  | 'artifact'
  | 'session'
  | 'agent_run'
  | 'evidence_source'
  | 'context_frame'
  | 'diff'
  | 'plan';
export type WorkspaceReferenceKind = ContextReferenceKind | 'resource';

export interface ContextReferencePart {
  type: 'context_ref';
  ref_kind: ContextReferenceKind;
  ref_id: string;
  label: string;
  revision?: string;
}

export interface WorkspaceReference {
  kind: WorkspaceReferenceKind;
  id: string;
  label: string;
  detail: string;
  media_type: string;
  revision: string;
  navigation: Record<string, unknown>;
}

export type ComposerMessagePart =
  | { type: 'text'; text: string }
  | ContextReferencePart
  | {
      type: 'resource_ref';
      resource_id: string;
      resource_revision: string;
      name: string;
      delivery_preference?: string;
    };

export interface MessageSubmissionInput {
  parts: ComposerMessagePart[];
  client_message_id: string;
  idempotency_key: string;
  delivery: MessageDelivery;
  behavior: MessageBehavior;
  model: ComposerModelRef;
  metadata?: Record<string, unknown>;
}

export interface MessageAcceptance {
  message_id: string;
  accepted_at: string;
  delivery: MessageDelivery;
  state: 'started' | 'pending_steer' | 'queued';
  effective_model: ComposerModelRef;
  behavior: MessageBehavior;
  idempotent_replay: boolean;
}

export interface PendingSteer {
  message_id: string;
  session_id: string;
  parts: ComposerMessagePart[];
  text: string;
  metadata: Record<string, unknown>;
  accepted_at: string;
  behavior: MessageBehavior;
  model: ComposerModelRef;
  state: 'pending' | 'claimed' | 'consumed' | 'cancelled';
  claimed_at: string;
  consumed_at: string;
  cancelled_at: string;
}

/** The service's confirmation that one accepted-but-undelivered steer is gone. */
export interface PendingSteerCancellation {
  message_id: string;
  session_id: string;
}

/** The service's answer to promoting a queued message into the live turn. */
export interface QueuedMessagePromotion {
  queued_message_id: string;
  acceptance: MessageAcceptance;
  /** The status the underlying message submission answered with. */
  status_code?: number;
}

export interface QueuedMessage {
  id: string;
  session_id: string;
  revision: number;
  position: number;
  parts: ComposerMessagePart[];
  metadata: Record<string, unknown>;
  client_message_id: string;
  idempotency_key: string;
  behavior: MessageBehavior;
  model: ComposerModelRef;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceResource {
  id: string;
  workspace_id: string;
  client_upload_id: string;
  revision: number;
  name: string;
  claimed_mime: string;
  detected_mime: string;
  detection_source: string;
  declared_size: number;
  received_size: number;
  sha256: string;
  state: 'uploading' | 'ready' | 'quarantined' | 'failed';
  failure: string;
  created_at: string;
  updated_at: string;
  completed_at: string;
  mime_mismatch: boolean;
  processing?: WorkspaceResourceProcessing;
  idempotent_replay?: boolean;
  upload_url?: string;
}

export interface WorkspaceResourceProcessing {
  workspace_id: string;
  resource_id: string;
  resource_revision: number;
  source_sha256: string;
  processor: string;
  processor_url: string;
  job_id: string;
  query_tool?: string;
  state: 'not_started' | 'submitted' | 'processing' | 'complete' | 'failed' | 'cancelled';
  progress: number;
  progress_kind?: 'unknown' | 'stage' | 'measured';
  stage?: string;
  message?: string;
  events?: WorkspaceResourceProcessingEvent[];
  derivatives_available?: boolean;
  failure: Record<string, unknown>;
  cancellation: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceResourceProcessingEvent {
  sequence: number;
  created_at: string;
  level: 'info' | 'warning' | 'error';
  progress: number;
  progress_kind: 'unknown' | 'stage' | 'measured';
  stage: string;
  message: string;
}

export interface WorkspaceResourceDerivative {
  id: string;
  name: string;
  media_type: string;
  kind: string;
  size?: number;
  content_url?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceResourceDerivatives {
  resource_id: string;
  revision: number;
  derivatives: WorkspaceResourceDerivative[];
  processor: WorkspaceResourceProcessing;
}

export interface WorkspaceResourceStructure {
  resource_id: string;
  revision: number;
  collections: Record<string, number>;
}

export interface WorkspaceResourceStructureNode {
  collection: string;
  index: number;
  node: unknown;
}

export interface WorkspaceResourceSearchResult {
  resource_id: string;
  query: string;
  matches: Array<{ line: number; text: string }>;
  truncated: boolean;
}

export interface ResourceDeliveryRecord {
  id: string;
  workspace_id: string;
  resource_id: string;
  resource_revision: number;
  resource_sha256: string;
  message_id: string;
  provider_id: string;
  model_id: string;
  representation: ResourceDeliveryRepresentation;
  evidence_source: string;
  evidence_generated_at: string;
  reason: string;
  delivered_at: string;
}

export interface ProviderCatalogModel {
  provider_id: string;
  provider_kind: string;
  endpoint: string;
  deployment: string;
  model_id: string;
  revision: string;
  modalities: string[];
  reasoning: { supported: boolean; parameter: string };
  native_tool_calling: boolean;
  context_window?: number;
  loaded_context_window?: number;
  output_limit?: number;
  /**
   * What the service reports about this model's usability — `available`,
   * `candidate`, or `unavailable` today. Deliberately an open string: the wire
   * field is one, a union ending in `| string` collapses to `string` anyway,
   * and the raw token is what an honest "unknown" presentation needs to show.
   * Read it through a label map, never straight into user-facing copy.
   */
  availability: string;
  evidence: {
    source: string;
    generated_at: string;
    live: boolean;
    context_source: string;
  };
  failure: string;
}

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  kind: string;
  endpoint: string;
  configuration_url: string;
  connectivity: string;
  auth: string;
  health: string;
  freshness: { generated_at: string; source: string };
  failure: string;
  models: ProviderCatalogModel[];
}

export interface ProviderCatalog {
  providers: ProviderCatalogEntry[];
  authoritative: string;
}
