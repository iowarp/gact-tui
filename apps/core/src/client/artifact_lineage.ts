import type { HttpTransport } from './transport.js';

type LineageTransport = Pick<HttpTransport, 'get'>;

/** One node of the artifact lineage graph (artifact | activity | gap). */
export interface ArtifactLineageNode {
  id: string;
  type: 'artifact' | 'activity' | 'gap';
  name?: string;
  version?: number;
  kind?: string;
  workspace_id?: string;
  sha256?: string;
  mechanism?: string;
  custody_gap?: boolean;
  producer_call_id?: string;
  call_id?: string;
  tool?: string;
  status?: string;
  session_id?: string;
  turn_id?: string;
  [key: string]: unknown;
}

/** One typed edge (`used` | `generated` | `revision_of`) with its evidence. */
export interface ArtifactLineageEdge {
  from: string;
  to: string;
  type: string;
  evidence?: string;
  [key: string]: unknown;
}

/** GET /v1/artifacts/{id}/lineage response. */
export interface ArtifactLineageResult {
  root: string;
  direction: string;
  depth: number;
  nodes: ArtifactLineageNode[];
  edges: ArtifactLineageEdge[];
  truncated?: { reason: string; nodes?: number; at_depth?: number } | null;
}

export interface ArtifactLineageOptions {
  direction?: 'upstream' | 'downstream' | 'both';
  depth?: number;
}

/** Read the provenance graph around one artifact version. */
export function fetchArtifactLineage(
  client: LineageTransport,
  artifactId: string,
  options: ArtifactLineageOptions = {},
): Promise<ArtifactLineageResult> {
  const params = new URLSearchParams();
  if (options.direction) params.set('direction', options.direction);
  if (typeof options.depth === 'number') params.set('depth', String(options.depth));
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return client.get<ArtifactLineageResult>(
    `/v1/artifacts/${encodeURIComponent(artifactId)}/lineage${suffix}`,
  );
}
