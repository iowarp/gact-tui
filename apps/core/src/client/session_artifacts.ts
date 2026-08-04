import type { HttpTransport } from './transport.js';

type SessionArtifactTransport = Pick<HttpTransport, 'get'>;

/** The producing call recorded on an immutable artifact version. */
export interface SessionArtifactProducer {
  call_id?: string;
  tool?: string;
  session_id?: string;
  turn_id?: string;
  designation?: string;
  arg?: string;
  result_key?: string;
  [key: string]: unknown;
}

/** One immutable version nested inside a session artifact record. */
export interface SessionArtifactVersion {
  artifact_id: string;
  workspace_id?: string;
  name: string;
  version: number;
  kind?: string;
  size_bytes?: number;
  path?: string;
  created_at?: string;
  producer?: SessionArtifactProducer;
  [key: string]: unknown;
}

/** A named artifact and its versions as returned by the session listing. */
export interface SessionArtifactRecord {
  workspace_id?: string;
  name: string;
  kind?: string;
  latest_version?: number;
  head_artifact_id?: string;
  versions: SessionArtifactVersion[];
  producing_session_ids?: string[];
  [key: string]: unknown;
}

/** Response from the session-scoped artifact read. */
export interface SessionArtifactsResult {
  artifacts: SessionArtifactRecord[];
  count: number;
  next_cursor?: string | null;
  include_children?: boolean;
  child_session_ids?: string[];
}

export interface SessionArtifactsOptions {
  limit?: number;
  before?: string;
  includeChildren?: boolean;
}

/** Read the artifacts visible from a session, optionally including descendants. */
export function fetchSessionArtifacts(
  client: SessionArtifactTransport,
  sessionId: string,
  options: SessionArtifactsOptions = {},
): Promise<SessionArtifactsResult> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.before) params.set('before', options.before);
  if (options.includeChildren) params.set('include_children', 'true');
  const query = params.size > 0 ? `?${params.toString()}` : '';
  return client.get(`/v1/sessions/${encodeURIComponent(sessionId)}/artifacts${query}`);
}
