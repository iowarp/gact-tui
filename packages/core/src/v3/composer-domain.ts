export type MessageDelivery = 'start' | 'steer' | 'auto';

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

export type ComposerMessagePart =
  | { type: 'text'; text: string }
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
  state: 'not_started' | 'submitted' | 'processing' | 'complete' | 'failed';
  progress: number;
  failure: Record<string, unknown>;
  created_at: string;
  updated_at: string;
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
  representation: string;
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
  availability: 'available' | 'candidate' | 'unavailable' | string;
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
