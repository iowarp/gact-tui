/**
 * Wires one active session's live transcript: snapshot fetch + reconcile, the
 * SSE connection, and the event handler that feeds reduced events into signals.
 */
import type { Client, PermissionRequest } from '@clio/core';
import type { Setter } from 'solid-js';
import type {
  NotificationSink,
  SessionEventSink,
} from './LiveReducer.js';
import { SEMANTIC_FEED_CAP } from './LiveConnectionConfig.js';
import { openLiveTranscriptConnection } from './LiveTranscriptConnection.js';
import { createLiveTranscriptEventHandler } from './LiveTranscriptEventHandler.js';
import { createTranscriptReconciler } from './LiveTranscriptReconcile.js';
import {
  clearLiveTranscriptSnapshot,
  fetchLiveTranscriptSnapshot,
  replaceLiveTranscriptSnapshot,
} from './LiveTranscriptSnapshot.js';
import type { LiveConnectionStatus } from './LiveReconnect.js';
import type { StreamStatsTracker } from './LiveStreamStats.js';
import type { LiveTranscriptSignals } from './LiveTranscriptState.js';

type LiveTranscriptSessionSignals = Pick<
  LiveTranscriptSignals,
  | 'setMessages'
  | 'setMessagesLoading'
  | 'setLastCompletion'
  | 'setCostUsd'
  | 'setRunningTools'
  | 'setPendingQuestion'
  | 'setSemanticEvents'
  | 'setExecutionEvents'
> & {
  /**
   * Plain-value setter for the pending-permission signal. The transcript root
   * passes the owning {@link LivePendingInteractionsHandle}'s guarded setter
   * here (not the raw Solid `Setter`), so all permission writes funnel through
   * one ordering guard. Only ever invoked with a concrete value/null — never a
   * functional updater — which is exactly the guarded setter's contract.
   */
  setPendingPermission: (next: PermissionRequest | null) => void;
};

export interface LiveTranscriptSessionOptions {
  client: Client;
  sessionId: string;
  signals: LiveTranscriptSessionSignals;
  setStatus: Setter<LiveConnectionStatus>;
  setReconnectInSec: Setter<number>;
  streamStatsTracker: StreamStatsTracker;
  sessionEvents?: SessionEventSink & Partial<NotificationSink>;
}

export interface LiveTranscriptSession {
  reconnectNow: () => void;
  close: () => void;
}

export function startLiveTranscriptSession(
  options: LiveTranscriptSessionOptions,
): LiveTranscriptSession {
  const { client, sessionId, signals, streamStatsTracker, sessionEvents } = options;

  // Loading flips true on every session switch so the transcript can
  // render skeletons instead of flashing an empty conversation.
  signals.setMessagesLoading(true);
  const snapshotSetters = {
    setMessages: signals.setMessages,
    setPendingPermission: signals.setPendingPermission,
    setPendingQuestion: signals.setPendingQuestion,
  };
  // Disposal guard (iowarp/gact-tui#226): switching sessions A -> B closes
  // A's session while its snapshot fetch may still be in flight. The shared
  // signals now belong to B, so a late A resolution (or failure) must be
  // discarded — mirroring the current-session guard the Go TUI applies in
  // tui/internal/ui/message_load_commands.go.
  let disposed = false;
  void fetchLiveTranscriptSnapshot(client, sessionId)
    .then((snapshot) => {
      if (disposed) {
        console.warn('[live] stale transcript snapshot discarded', {
          reason: 'snapshot_session_disposed',
          session_id: sessionId,
        });
        return;
      }
      replaceLiveTranscriptSnapshot(snapshot, snapshotSetters);
    })
    .catch((error: unknown) => {
      if (disposed) {
        console.warn('[live] stale transcript snapshot failure ignored', {
          reason: 'snapshot_session_disposed',
          session_id: sessionId,
          error,
        });
        return;
      }
      console.warn('[live] transcript snapshot fetch failed; clearing feed', {
        reason: 'snapshot_fetch_failed',
        session_id: sessionId,
        error,
      });
      clearLiveTranscriptSnapshot(snapshotSetters);
    })
    .finally(() => {
      // A disposed session's `finally` must not flip the NEW session's
      // loading skeleton off while its own snapshot is still in flight.
      if (!disposed) signals.setMessagesLoading(false);
    });
  const transcriptReconciler = createTranscriptReconciler({
    client,
    sessionId,
    setMessages: signals.setMessages,
    isDisposed: () => disposed,
    refetchSessions: sessionEvents?.refetch,
  });

  const handleData = createLiveTranscriptEventHandler({
    sessionId,
    trackStreamEvent: (event) => streamStatsTracker.track(event),
    reduceHooks: {
      setMessages: signals.setMessages,
      setPendingPermission: signals.setPendingPermission,
      setLastCompletion: signals.setLastCompletion,
      setCostUsd: signals.setCostUsd,
      setRunningTools: signals.setRunningTools,
      setPendingQuestion: signals.setPendingQuestion,
      setSemanticEvents: signals.setSemanticEvents,
      semanticFeedCap: SEMANTIC_FEED_CAP,
      setExecutionEvents: signals.setExecutionEvents,
      sessionEvents,
      onNotification: sessionEvents?.onNotification,
      onFrameChanged: sessionEvents?.onFrameChanged,
      onContextFilesChanged: sessionEvents?.onContextFilesChanged,
      onDiffChanged: sessionEvents?.onDiffChanged,
      onMemoryChanged: sessionEvents?.onMemoryChanged,
    },
    scheduleReconcile: () => transcriptReconciler.schedule(),
  });

  const connection = openLiveTranscriptConnection({
    sseUrl: client.sseUrl(sessionId),
    setStatus: options.setStatus,
    setReconnectInSec: options.setReconnectInSec,
    onData: handleData,
    onConnectionLost: () => transcriptReconciler.schedule(),
    onFocus: () => {
      transcriptReconciler.schedule();
      sessionEvents?.refetch?.();
    },
  });

  return {
    reconnectNow: () => connection.reconnectNow(),
    close: () => {
      disposed = true;
      transcriptReconciler.cancel();
      connection.close();
    },
  };
}
