import {
  createEntityState,
  type EntityState,
  type Message,
  type TranscriptSnapshot,
  type TransportFrame,
} from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { recordById } from '@/lib/entities';
import { queryKeys } from '@/lib/query-keys';
import { STREAM_RECONNECT_BASE_MS } from '@/lib/runtime-limits';
import { FrameBatcher } from '@/lib/streaming/frame-batcher';
import { reduceFramesContained } from '@/lib/streaming/frame-reduction';
import { abortableDelay, nextReconnectDelay } from '@/lib/streaming/reconnect';
import { useConnectionSettings } from '@/providers/connection-provider';
import { MAX_RETAINED_FRAME_GAPS } from '@/store/live-store';
import { useRepository } from './use-repository';

/**
 * A secondary session's transcript kept live beside the main conversation: a
 * child agent open in the canvas, or a read-only side conversation.
 *
 * Fetches the snapshot once, then follows the session's own stream from the
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
  const transcript = useQuery({
    queryKey: queryKeys.key('transcript', settings.endpoint, sessionId, view),
    queryFn: ({ signal }) => repository.transcript(sessionId!, signal),
    enabled: Boolean(sessionId),
  });
  const snapshotEntities = useMemo(
    () => (transcript.data ? stateFromSnapshot(transcript.data) : createEntityState()),
    [transcript.data],
  );
  const [liveState, setLiveState] = useState<{
    snapshot?: TranscriptSnapshot;
    entities: EntityState;
  }>(() => ({ snapshot: transcript.data, entities: snapshotEntities }));
  const entities = liveState.snapshot === transcript.data ? liveState.entities : snapshotEntities;

  useEffect(() => {
    if (!sessionId || !transcript.data) return;
    const controller = new AbortController();
    const snapshot = transcript.data;
    let cursor = snapshot.cursor;
    const updateEntities = (project: (base: EntityState) => EntityState) => {
      setLiveState((current) => {
        const base = current.snapshot === snapshot ? current.entities : snapshotEntities;
        return { snapshot, entities: project(base) };
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
      batcher.stop({ flush: true });
    };
  }, [sessionId, repository, snapshotEntities, transcript.data, workspaceId]);

  const messages = useMemo(
    () =>
      Object.values(entities.messages)
        .filter((message): message is Message => message.session_id === sessionId)
        .sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [sessionId, entities.messages],
  );

  return { entities, messages, transcript };
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
