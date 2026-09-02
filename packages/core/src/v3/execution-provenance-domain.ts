import type { Degradation } from './domain.js';

export interface ProvenanceProviderHealth {
  status?: string;
  queue_depth?: number;
  accepted?: number;
  filtered?: number;
  overflow?: number;
  failed?: number;
  last_error?: string;
  flush_durable?: boolean;
  flush_note?: string;
  [key: string]: unknown;
}

export interface ProvenanceProviderSummary {
  name: string;
  configured: boolean;
  queryable: boolean;
  durable: boolean;
  status: string;
  source: string;
  health: ProvenanceProviderHealth;
}

export interface ArtifactProvenanceProviderSummary {
  provider: string;
  queryable: boolean;
  durable: boolean;
  status: string;
  health: ProvenanceProviderHealth;
}

export interface ProvenanceProvidersResult {
  schema_version: string;
  default_provider: string;
  providers: ProvenanceProviderSummary[];
  artifact?: ArtifactProvenanceProviderSummary;
}

export interface ExecutionProvenanceArtifactRef {
  artifact_id: string;
  sha256: string;
}

export interface ExecutionProvenanceSpan {
  id: string;
  parent_id: string;
  kind: string;
  session_id: string;
  root_session_id?: string;
  owner_session_id?: string;
  workflow_id: string;
  campaign_id: string;
  agent_id: string;
  source_agent_id: string;
  task_id?: string;
  task_path?: string[];
  invocation_id?: string;
  tool_name?: string;
  surface_id?: string;
  label: string;
  event_type: string;
  status: string;
  start_time: number | null;
  end_time: number | null;
  duration_ms: number | null;
  host: string;
  artifact_refs: ExecutionProvenanceArtifactRef[];
  attributes: Record<string, unknown>;
  source_event_ids: string[];
}

export interface ExecutionProvenanceNode {
  id: string;
  kind: string;
  label: string;
  status: string;
  session_id: string;
  agent_id: string;
  start_time: number | null;
  end_time: number | null;
  attributes: Record<string, unknown>;
}

export interface ExecutionProvenanceEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  event_id?: string;
  [key: string]: unknown;
}

/** Authoritative root-to-child ownership supplied by CLIO's child-work projection. */
export interface ExecutionSessionLineage {
  session_id: string;
  parent_session_id: string;
  task_id: string;
  agent_id: string;
  label: string;
  depth: number;
  task_path: string[];
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ExecutionProvenanceEntity {
  [key: string]: unknown;
}

export interface ExecutionProvenanceResult {
  schema_version: string;
  provider: string;
  session_id: string;
  root_session_id?: string;
  session_lineage?: ExecutionSessionLineage[];
  complete: boolean;
  truncated: boolean;
  provider_health: ProvenanceProviderHealth;
  campaigns: ExecutionProvenanceEntity[];
  workflows: ExecutionProvenanceEntity[];
  agents: ExecutionProvenanceEntity[];
  spans: ExecutionProvenanceSpan[];
  nodes: ExecutionProvenanceNode[];
  edges: ExecutionProvenanceEdge[];
}

export interface ExecutionProvenanceOptions {
  provider?: string;
  includeChildren?: boolean;
  limit?: number;
}

export type ExecutionProvenanceDegradation = Degradation & {
  provider?: string;
  partial: boolean;
};
