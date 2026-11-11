import { decodeEventEnvelope, type TransportFrame } from '@clio/core/v3';
import type { Query, QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { FrameBatcher, type FrameClock } from './frame-batcher';

/**
 * One rule for every data source a view reads: a fixed source (an artifact id, one
 * version) is cached for good, and a live source is re-read when its change event
 * arrives, never on a timer.
 *
 * - A named artifact at its latest version (`artifact://<workspace>/<name>@latest`)
 *   changes when a version of that name is recorded (`artifact.created`,
 *   `artifact.version.added`, `artifact.alias.moved`). Its resolution is re-read; the
 *   rows of each version stay cached under that version's id.
 * - A stream (a named artifact the server holds in memory) changes with each write; a
 *   view on screen holds a lease on it and gets `stream.updated`, at most once per push
 *   interval, and re-reads its rows.
 * - A study's `records/<view>` changes when a tool result carries a record row of that
 *   view (`science.record`). Its measurements and entries change with each entry
 *   (`science.entry`, see `science-log-updates.ts`).
 */
export type LiveSourceChange =
  | { kind: 'artifact'; workspaceId: string; name: string }
  | { kind: 'stream'; streamId: string }
  | { kind: 'records'; study: string; view: string };

const LIVE_FRAMES = new Set(['semantic.event', 'science.record', 'stream.updated']);
const ARTIFACT_EVENTS = new Set([
  'artifact.created',
  'artifact.version.added',
  'artifact.alias.moved',
]);

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The live source a frame changes, or `undefined`. Artifact lifecycle events reach the
 * stream inside a `semantic.event` frame, so the semantic event's own type is read.
 */
export function liveSourceChangeForFrame(frame: TransportFrame): LiveSourceChange | undefined {
  if (!LIVE_FRAMES.has(frame.eventName)) return undefined;
  let payload: Record<string, unknown>;
  try {
    payload = record(decodeEventEnvelope(frame.data).payload);
  } catch {
    // Frame reduction owns malformed-envelope gap reporting.
    return undefined;
  }
  if (frame.eventName === 'stream.updated') {
    const streamId = text(payload.stream_id);
    return streamId ? { kind: 'stream', streamId } : undefined;
  }
  if (frame.eventName === 'science.record') {
    const study = text(payload.study);
    const view = text(payload.view);
    return study && view ? { kind: 'records', study, view } : undefined;
  }
  if (!ARTIFACT_EVENTS.has(text(payload.event_type))) return undefined;
  const subject = record(payload.subject);
  const body = record(payload.payload);
  const workspaceId = text(subject.workspace_id) || text(body.workspace_id);
  const name = text(subject.name) || text(body.name);
  return workspaceId && name ? { kind: 'artifact', workspaceId, name } : undefined;
}

/** The workspace and name of `artifact://<workspace>/<name>@latest`, or `undefined`. */
export function latestArtifactSource(
  uri: unknown,
): { workspaceId: string; name: string } | undefined {
  if (typeof uri !== 'string') return undefined;
  const match = /^artifact:\/\/([A-Za-z0-9_-]+)\/([^@\s?#]+)@latest$/u.exec(uri);
  if (!match) return undefined;
  let name = match[2]!;
  try {
    name = decodeURIComponent(name);
  } catch {
    // A name that is not percent-encoded is matched as written.
  }
  return { workspaceId: match[1]!, name };
}

/** Whether a cached reference resolution follows the artifact a change names. */
function resolvesChangedArtifact(
  query: Query,
  endpoint: string,
  changed: ReadonlySet<string>,
): boolean {
  const [namespace, queryEndpoint, , uri] = query.queryKey;
  if (namespace !== 'a2ui-reference' || queryEndpoint !== endpoint) return false;
  const source = latestArtifactSource(uri);
  return Boolean(source && changed.has(`${source.workspaceId}/${source.name}`));
}

/** Re-reads the live sources a frame changes, once per display frame. */
export class LiveSourceRefresher {
  private readonly batcher: FrameBatcher<LiveSourceChange>;

  public constructor(
    queryClient: Pick<QueryClient, 'invalidateQueries'>,
    endpoint: string,
    sessionId: string,
    clock?: FrameClock,
  ) {
    this.batcher = new FrameBatcher<LiveSourceChange>((changes) => {
      const artifacts = new Set<string>();
      const records = new Map<string, { study: string; view: string }>();
      const streams = new Set<string>();
      for (const change of changes) {
        if (change.kind === 'artifact') artifacts.add(`${change.workspaceId}/${change.name}`);
        else if (change.kind === 'stream') streams.add(change.streamId);
        else records.set(`${change.study}/${change.view}`, change);
      }
      // A stream changed: its rows are re-read once per frame, however many writes came.
      for (const streamId of streams)
        void queryClient.invalidateQueries({
          queryKey: queryKeys.key('stream-rows', endpoint, streamId),
        });
      if (artifacts.size) {
        void queryClient.invalidateQueries({
          predicate: (query) => resolvesChangedArtifact(query, endpoint, artifacts),
        });
        // The session's artifact list gains the version too, without waiting for the turn.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.sessionArtifacts(endpoint, sessionId),
        });
      }
      for (const { study, view } of records.values())
        void queryClient.invalidateQueries({
          queryKey: queryKeys.key('study-source', endpoint, study, `records/${view}`),
        });
    }, clock);
  }

  public push(frame: TransportFrame): void {
    const change = liveSourceChangeForFrame(frame);
    if (change) this.batcher.push(change);
  }

  public stop(options: { flush: boolean }): void {
    this.batcher.stop(options);
  }
}
