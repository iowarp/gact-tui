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

/** Newest-first page size for the artifact-listing walk (gact-tui#363) —
 *  the server's own default (clio-agent routes/artifacts.py). */
const DEFAULT_ARTIFACT_PAGE_SIZE = 50;

export interface FetchAllSessionArtifactsOptions {
  includeChildren?: boolean;
  pageSize?: number;
  /**
   * Checked before EVERY round trip (mirrors `backfillChildMessages`'s
   * contract in session/messageEvents.ts) and stops the walk the instant it
   * turns true. A session switch or unmount must never let a stale page's
   * fetch continue, let alone land on the wrong view.
   */
  isStale?: () => boolean;
}

/**
 * Walk every page of `GET /v1/sessions/{id}/artifacts` via `next_cursor`,
 * returning the FULL union (gact-tui#363: the server clamps to
 * limit=50/max=200 and returns `next_cursor`; every existing call site
 * discarded it, so any session holding >50 artifact records silently
 * under-reported in the obs panel, the composer pill, and the artifact
 * panel).
 *
 * Mirrors the proven progressive-load backfill idiom
 * (`backfillChildMessages`/`prependOlderPage` in session/messageEvents.ts),
 * adapted for a caller that needs the COMPLETE list rather than a
 * newest-page-first paint: `isStale` is checked before EVERY round trip and
 * bails out silently the moment it turns true, keeping whatever pages
 * already landed.
 *
 * A page-2-or-later failure (network error) keeps whatever was already
 * accumulated and stops — never a retry loop, never a fabricated gap. The
 * FIRST page's failure is different and DOES throw: every existing call
 * site wraps this in `fetchOutcome`/try-catch specifically to render an
 * honest "unresolved" (e.g. "—") instead of a confident "0" when the read
 * fails outright — silently returning an empty union on a total failure
 * would be indistinguishable from a genuinely artifact-less session, the
 * exact false-zero regression round-6/round-7 already have tests pinning.
 */
export async function fetchAllSessionArtifacts(
  client: SessionArtifactTransport,
  sessionId: string,
  options: FetchAllSessionArtifactsOptions = {},
): Promise<SessionArtifactsResult> {
  const pageSize = options.pageSize ?? DEFAULT_ARTIFACT_PAGE_SIZE;
  const isStale = options.isStale ?? (() => false);
  const artifacts: SessionArtifactRecord[] = [];
  let includeChildrenResult: boolean | undefined;
  let childSessionIds: string[] | undefined;
  let cursor: string | undefined;
  let firstPage = true;

  for (;;) {
    if (isStale()) break;
    let page: SessionArtifactsResult;
    try {
      page = await fetchSessionArtifacts(client, sessionId, {
        limit: pageSize,
        ...(cursor ? { before: cursor } : {}),
        ...(options.includeChildren ? { includeChildren: true } : {}),
      });
    } catch (err) {
      if (firstPage) throw err;
      break;
    }
    firstPage = false;
    if (isStale()) break;
    artifacts.push(...(page.artifacts ?? []));
    if (page.include_children !== undefined) includeChildrenResult = page.include_children;
    if (page.child_session_ids !== undefined) childSessionIds = page.child_session_ids;
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }

  return {
    artifacts,
    count: artifacts.length,
    next_cursor: null,
    ...(includeChildrenResult !== undefined ? { include_children: includeChildrenResult } : {}),
    ...(childSessionIds !== undefined ? { child_session_ids: childSessionIds } : {}),
  };
}
