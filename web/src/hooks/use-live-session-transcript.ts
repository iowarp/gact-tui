import {
  createEntityState,
  type EntityState,
  type Message,
  type TranscriptSnapshot,
  type TransportFrame,
} from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { recordById } from '@/lib/entities';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { STREAM_RECONNECT_BASE_MS, TRANSCRIPT_PAGE_SIZE } from '@/lib/runtime-limits';
import { FrameBatcher } from '@/lib/streaming/frame-batcher';
import { reduceFramesContained } from '@/lib/streaming/frame-reduction';
import { abortableDelay, nextReconnectDelay } from '@/lib/streaming/reconnect';
import { useConnectionSettings } from '@/providers/connection-provider';
import { MAX_RETAINED_FRAME_GAPS } from '@/store/live-store';
import type { EarlierMessages } from './use-earlier-messages';
import { useRepository } from './use-repository';

/**
 * A secondary session's transcript kept live beside the main conversation: a
 * child agent open in the canvas, or a read-only side conversation.
 *
 * Fetches the newest page once (older pages load on request, like the main
 * conversation, so a long child transcript is never read whole), then follows the session's own stream from the
 * snapshot cursor, reconnecting with backoff when the service closes it. The
 * main live store is never touched: this state belongs to the panel showing it.
 *
 * @param view - Distinguishes the snapshot cache entry of each surface that
 *   shows the same session (e.g. `'canvas'`, `'aside'`).
 */
export function useLiveSessionTranscript(
  workspaceId: string,
  sessionId: string | undefined,
  view: string,
) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const transcript = useQuery({
    queryKey: queryKeys.key('transcript', scope, sessionId, view),
    queryFn: ({ signal }) =>
      repository.transcript(sessionId!, signal, { limit: TRANSCRIPT_PAGE_SIZE }),
    enabled: Boolean(sessionId),
  });
  const snapshotEntities = useMemo(
    () => (transcript.data ? stateFromSnapshot(transcript.data) : createEntityState()),
    [transcript.data],
  );
  const [liveState, setLiveState] = useState<{
    scope: string;
    snapshot?: TranscriptSnapshot;
    entities: EntityState;
  }>(() => ({ scope, snapshot: transcript.data, entities: snapshotEntities }));
  const liveEntities =
    liveState.scope === scope && liveState.snapshot === transcript.data
      ? liveState.entities
      : snapshotEntities;

  useEffect(() => {
    if (!sessionId || !transcript.data) return;
    const controller = new AbortController();
    const snapshot = transcript.data;
    let cursor = snapshot.cursor;
    const updateEntities = (project: (base: EntityState) => EntityState) => {
      setLiveState((current) => {
        const base =
          current.scope === scope && current.snapshot === snapshot
            ? current.entities
            : snapshotEntities;
        return { scope, snapshot, entities: project(base) };
      });
    };
    const batcher = new FrameBatcher<TransportFrame>((frames) => {
      updateEntities((base) => {
        // Contained per frame: one unreadable frame becomes a typed gap instead
        // of discarding its batch and throwing into the workspace error boundary.
        const { entities, gaps } = reduceFramesContained(base, frames);
        return gaps.length
          ? { ...entities, gaps: [...entities.gaps, ...gaps].slice(-MAX_RETAINED_FRAME_GAPS) }
          : entities;
      });
    });

    void (async () => {
      let reconnectDelay = STREAM_RECONNECT_BASE_MS;
      while (!controller.signal.aborted) {
        try {
          for await (const frame of repository.stream(
            { connection_id: 'active', workspace_id: workspaceId, session_id: sessionId },
            cursor,
            controller.signal,
          )) {
            reconnectDelay = STREAM_RECONNECT_BASE_MS;
            if (frame.cursor) cursor = frame.cursor;
            updateEntities((base) => (base.stream === 'live' ? base : { ...base, stream: 'live' }));
            batcher.push(frame);
          }
        } catch (error) {
          if (controller.signal.aborted) break;
          if (error instanceof Error && error.name === 'AbortError') break;
        }
        if (controller.signal.aborted) break;
        updateEntities((base) => ({ ...base, stream: 'reconnecting' }));
        await abortableDelay(controller, reconnectDelay);
        reconnectDelay = nextReconnectDelay(reconnectDelay);
      }
    })();

    return () => {
      controller.abort();
      batcher.stop({ flush: false });
    };
  }, [scope, sessionId, repository, snapshotEntities, transcript.data, workspaceId]);

  const olderKey = `\u0000\u0000`;
  const [rawOlder, setOlder] = useState<OlderPages>(() => emptyOlderPages(olderKey));
  const older = rawOlder.key === olderKey ? rawOlder : emptyOlderPages(olderKey);
  // Older pages sit under the live state: a live update of a message wins.
  const entities = useMemo(
    () =>
      older.messages === EMPTY_RECORD
        ? liveEntities
        : {
            ...liveEntities,
            messages: { ...older.messages, ...liveEntities.messages },
            tools: { ...older.tools, ...liveEntities.tools },
            tasks: { ...older.tasks, ...liveEntities.tasks },
            subagents: { ...older.subagents, ...liveEntities.subagents },
            artifacts: { ...older.artifacts, ...liveEntities.artifacts },
            surfaces: { ...older.surfaces, ...liveEntities.surfaces },
          },
    [liveEntities, older],
  );

  const messages = useMemo(
    () =>
      Object.values(entities.messages)
        .filter((message): message is Message => message.session_id === sessionId)
        .sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [sessionId, entities.messages],
  );

  const oldestMessageId = messages[0]?.id;
  const hasEarlier = Boolean(
    sessionId && transcript.data?.next_cursor && oldestMessageId && !older.startReached,
  );
  const loadEarlier = useCallback(() => {
    if (!sessionId || !oldestMessageId || !hasEarlier || older.loading) return;
    setOlder({ ...older, loading: true, error: undefined });
    repository
      .transcript(sessionId, undefined, { limit: TRANSCRIPT_PAGE_SIZE, before: oldestMessageId })
      .then((page) => {
        setOlder((current) => {
          if (current.key !== olderKey) return current;
          const adds = page.messages.some((message) => !(message.id in entities.messages));
          return {
            key: olderKey,
            loading: false,
            // No cursor, or a page that adds nothing, means the start is reached.
            startReached: !page.next_cursor || !adds,
            messages: { ...current.messages, ...recordById(page.messages) },
            tools: { ...current.tools, ...recordById(page.tools) },
            tasks: { ...current.tasks, ...recordById(page.tasks) },
            subagents: { ...current.subagents, ...recordById(page.subagents) },
            artifacts: { ...current.artifacts, ...recordById(page.artifacts) },
            surfaces: { ...current.surfaces, ...recordById(page.surfaces) },
          };
        });
      })
      .catch((error: unknown) => {
        setOlder((current) =>
          current.key === olderKey
            ? {
                ...current,
                loading: false,
                error: error instanceof Error ? error.message : String(error),
              }
            : current,
        );
      });
  }, [entities.messages, hasEarlier, older, olderKey, oldestMessageId, repository, sessionId]);
  const earlier = useMemo<EarlierMessages | undefined>(
    () =>
      transcript.data?.next_cursor
        ? { hasEarlier, loading: older.loading, error: older.error, load: loadEarlier }
        : undefined,
    [hasEarlier, loadEarlier, older.error, older.loading, transcript.data?.next_cursor],
  );

  return { entities, messages, transcript, earlier };
}

const EMPTY_RECORD: Record<string, never> = {};

interface OlderPages {
  key: string;
  loading: boolean;
  startReached: boolean;
  error?: string;
  messages: EntityState['messages'];
  tools: EntityState['tools'];
  tasks: EntityState['tasks'];
  subagents: EntityState['subagents'];
  artifacts: EntityState['artifacts'];
  surfaces: EntityState['surfaces'];
}

function emptyOlderPages(key: string): OlderPages {
  return {
    key,
    loading: false,
    startReached: false,
    messages: EMPTY_RECORD,
    tools: EMPTY_RECORD,
    tasks: EMPTY_RECORD,
    subagents: EMPTY_RECORD,
    artifacts: EMPTY_RECORD,
    surfaces: EMPTY_RECORD,
  };
}

function stateFromSnapshot(snapshot: TranscriptSnapshot): EntityState {
  return {
    ...createEntityState(),
    stream: 'connecting',
    messages: recordById(snapshot.messages),
    tools: recordById(snapshot.tools),
    tasks: recordById(snapshot.tasks),
    subagents: recordById(snapshot.subagents),
    artifacts: recordById(snapshot.artifacts),
    surfaces: recordById(snapshot.surfaces),
  };
}
