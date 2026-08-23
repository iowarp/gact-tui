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

/**
 * Hard ceiling on pages walked per call (Opus adversarial review, PROVEN
 * DEFECT: with no cap, a constant/looping `next_cursor` walked 501 requests
 * and then resolved SUCCESSFULLY with 500 duplicated records — a malformed
 * cursor or a server bug turned into an unbounded client-side fetch storm
 * with no visible failure at all). At the default 50-per-page size this is
 * 5,000 artifacts — far beyond any real session — before the walk gives up
 * and reports truncation instead of continuing.
 */
const MAX_ARTIFACT_PAGES = 100;

/**
 * Why `fetchAllSessionArtifacts` stopped WITHOUT exhausting `next_cursor` —
 * the union may under-report relative to the full server-side listing. Never
 * silently indistinguishable from a complete read; see
 * {@link FetchAllSessionArtifactsResult.truncated}.
 */
export type ArtifactWalkTruncationReason =
  | 'page_cap_reached'
  | 'cursor_cycle_detected'
  | 'page_fetch_failed'
  | 'stale';

export interface FetchAllSessionArtifactsResult extends SessionArtifactsResult {
  /**
   * `null` — the walk reached `next_cursor: null`/absent normally; the union
   * is a genuinely complete read. Otherwise, the specific reason the walk
   * stopped early:
   * - `'page_cap_reached'` — hit {@link MAX_ARTIFACT_PAGES}; either a
   *   legitimately huge session or a server bug that never terminates the
   *   cursor chain.
   * - `'cursor_cycle_detected'` — the server handed back a `next_cursor`
   *   this walk already used (constant or looping) — stopped immediately
   *   rather than re-fetching the same page(s) forever.
   * - `'page_fetch_failed'` — a page-2-or-later network error; whatever
   *   pages already landed are kept (never a retry loop, never a thrown
   *   rejection this deep into a walk).
   * - `'stale'` — the caller's `isStale()` flipped true before the walk
   *   finished (including before the FIRST page — an immediately-stale
   *   call returns `{artifacts: [], count: 0, truncated: 'stale'}`, which
   *   must never be read as "this session genuinely has zero artifacts").
   */
  truncated: ArtifactWalkTruncationReason | null;
}

export interface FetchAllSessionArtifactsOptions {
  includeChildren?: boolean;
  pageSize?: number;
  /**
   * Checked before EVERY round trip (mirrors `backfillChildMessages`'s
   * contract in session/messageEvents.ts) and stops the walk the instant it
   * turns true. A session switch or unmount must never let a stale page's
   * fetch continue, let alone land on the wrong view. Sets
   * `truncated: 'stale'` on the returned result — see
   * {@link FetchAllSessionArtifactsResult.truncated}.
   */
  isStale?: () => boolean;
}

/** The record identity `prependOlderPage` (session/messageEvents.ts:170-175)
 *  dedupes messages by id, mirrored here for artifact records: a boundary
 *  record landing on two consecutive pages (the cursor window can overlap
 *  when artifacts are created concurrently with the walk) must collapse to
 *  ONE entry, never be double-counted. `head_artifact_id` is the record's
 *  real identity when present; `name` is the fallback for older/degenerate
 *  records that carry no head id. */
function artifactRecordKey(record: SessionArtifactRecord): string {
  return record.head_artifact_id ?? record.name;
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
 * newest-page-first paint: `isStale` is checked before EVERY round trip.
 * Records are accumulated keyed on {@link artifactRecordKey} (first
 * occurrence wins), so a record repeated across pages collapses to one
 * entry rather than inflating the count.
 *
 * **Bounded, never silent.** A cursor cycle (seen-cursor set, breaks on a
 * repeat) and a hard page cap ({@link MAX_ARTIFACT_PAGES}) both stop the
 * walk rather than looping or fetching forever, and EVERY early stop —
 * cycle, cap, a page-2+ failure, or a stale exit — is reported via the
 * returned `truncated` field (see
 * {@link FetchAllSessionArtifactsResult.truncated}); a truncated result is
 * never byte-identical to a complete one. The FIRST page's failure is
 * different and DOES throw (not merely truncate): every existing call site
 * wraps this in `fetchOutcome`/try-catch specifically to render an honest
 * "unresolved" (e.g. "—") instead of a confident "0" when the read fails
 * outright — silently returning an empty union on a total failure would be
 * indistinguishable from a genuinely artifact-less session, the exact
 * false-zero regression round-6/round-7 already have tests pinning.
 */
export async function fetchAllSessionArtifacts(
  client: SessionArtifactTransport,
  sessionId: string,
  options: FetchAllSessionArtifactsOptions = {},
): Promise<FetchAllSessionArtifactsResult> {
  const pageSize = options.pageSize ?? DEFAULT_ARTIFACT_PAGE_SIZE;
  const isStale = options.isStale ?? (() => false);
  const byKey = new Map<string, SessionArtifactRecord>();
  let includeChildrenResult: boolean | undefined;
  let childSessionIds: string[] | undefined;
  let cursor: string | undefined;
  let firstPage = true;
  let pagesFetched = 0;
  let truncated: ArtifactWalkTruncationReason | null = null;
  const seenCursors = new Set<string>();

  for (;;) {
    if (isStale()) {
      truncated = 'stale';
      break;
    }
    if (pagesFetched >= MAX_ARTIFACT_PAGES) {
      truncated = 'page_cap_reached';
      break;
    }
    let page: SessionArtifactsResult;
    try {
      page = await fetchSessionArtifacts(client, sessionId, {
        limit: pageSize,
        ...(cursor ? { before: cursor } : {}),
        ...(options.includeChildren ? { includeChildren: true } : {}),
      });
    } catch (err) {
      if (firstPage) throw err;
      truncated = 'page_fetch_failed';
      break;
    }
    firstPage = false;
    pagesFetched += 1;
    if (isStale()) {
      truncated = 'stale';
      break;
    }
    for (const record of page.artifacts ?? []) {
      const key = artifactRecordKey(record);
      if (!byKey.has(key)) byKey.set(key, record);
    }
    if (page.include_children !== undefined) includeChildrenResult = page.include_children;
    if (page.child_session_ids !== undefined) childSessionIds = page.child_session_ids;
    const next = page.next_cursor;
    if (!next) break;
    if (seenCursors.has(next)) {
      truncated = 'cursor_cycle_detected';
      break;
    }
    seenCursors.add(next);
    cursor = next;
  }

  const artifacts = [...byKey.values()];
  return {
    artifacts,
    count: artifacts.length,
    next_cursor: null,
    truncated,
    ...(includeChildrenResult !== undefined ? { include_children: includeChildrenResult } : {}),
    ...(childSessionIds !== undefined ? { child_session_ids: childSessionIds } : {}),
  };
}
