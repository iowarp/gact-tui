/** Artifact records, versions and lineage, and workspace file listings. */
import type { WireValue } from './domain.js';

export interface Artifact {
  id: string;
  session_id: string;
  workspace_id?: string;
  name: string;
  media_type: string;
  uri: string;
  fetch_path?: string;
  custody?: string;
  sha256?: string;
  size?: number;
  version?: number;
  created_at?: string;
  session_relation?: 'produced' | 'used';
  producer?: Record<string, unknown>;
}

export interface ArtifactVersion {
  media_type?: string;
  artifact_id: string;
  workspace_id: string;
  name: string;
  version: number;
  kind: string;
  custody: string;
  mechanism: string;
  evidence_class: string;
  sha256?: string;
  size_bytes?: number;
  authority?: string;
  path?: string;
  created_at: string;
  annotation?: string;
  producer: Record<string, unknown>;
  prior_version?: number;
  prior_sha256?: string;
  kind_warning?: string;
  custody_gap?: boolean | Record<string, unknown>;
  uri: string;
  fetch_url: string;
}

export interface ArtifactRecord {
  workspace_id: string;
  name: string;
  kind: string;
  latest_version: number;
  head_artifact_id: string;
  aliases: Record<string, number>;
  versions: ArtifactVersion[];
  producing_session_ids?: string[];
}

export interface SessionArtifactListing {
  artifacts: ArtifactRecord[];
  used: ArtifactRecord[];
  count: number;
  include_children: boolean;
  child_session_ids: string[];
  truncated?: 'page_cap_reached' | 'cursor_cycle_detected';
}

export interface ArtifactDetail {
  artifact: ArtifactRecord;
  resolved: ArtifactVersion;
}

export interface ArtifactLineageNode {
  id: string;
  type: 'artifact' | 'activity' | 'gap';
  [key: string]: unknown;
}

export interface ArtifactLineageEdge {
  from: string;
  to: string;
  type: 'used' | 'generated' | 'revision_of';
  evidence: string;
}

export interface ArtifactLineage {
  root: string;
  direction: 'upstream' | 'downstream' | 'both';
  depth: number;
  nodes: ArtifactLineageNode[];
  edges: ArtifactLineageEdge[];
  truncated?: { reason: string; nodes?: number; at_depth?: number };
}

export interface WorkspaceFileEntry {
  path: string;
  display_path?: string;
  type: WireValue<'file' | 'dir'>;
  internal: boolean;
  media_type?: string;
  source?: WireValue<'workspace' | 'managed_input'>;
  resource_id?: string;
  size?: number;
  modified?: string;
  /** A typed reason (e.g. "sandbox_child_cache") the server never walked this
   * directory's contents — the folder itself is still listed, just empty. */
  redacted?: string;
}

export interface WorkspaceFileListing {
  entries: WorkspaceFileEntry[];
  /** Whether the server's capped walk stopped before enumerating everything. */
  truncated: boolean;
  /** Next page in directory mode; absent on older recursive listing services. */
  next_offset?: number | null;
}
