/**
 * Top-level live-transcript composition root: owns the per-session SSE lifecycle
 * (open/teardown on session switch, snapshot reconcile, reconnect) and stitches
 * the focused sub-handles together. Exports {@link createLiveTranscript}.
 */
import { createEffect, onCleanup, type Accessor } from 'solid-js';
import { Client, mergeMessages } from '@clio/core';
import type {
  NotificationSink,
  SessionEventSink,
} from './LiveReducer.js';
import { fetchLiveTranscriptSnapshot } from './LiveTranscriptSnapshot.js';
import { createLivePendingInteractionsHandle } from './LivePendingInteractionsHandle.js';
import { createStreamStatsTracker } from './LiveStreamStats.js';
import {
  clearInactiveLiveTranscriptState,
  clearLiveTranscriptSessionFeeds,
} from './LiveTranscriptModel.js';
import { startLiveTranscriptSession } from './LiveTranscriptSession.js';
import {
  createLiveTranscriptSignals,
  type LiveTranscriptHandle,
} from './LiveTranscriptState.js';

export type { LiveTranscriptHandle } from './LiveTranscriptState.js';

/**
 * Live transcript handle for `activeSessionId`.
 *
 * This module stays focused on the SSE stream: opening/tearing down the
 * EventSource on session switch, reconciling the message feed from snapshots,
 * and the reconnect/backoff resilience. The pending permission + ask-user
 * question lifecycle is delegated to `createLivePendingInteractionsHandle`
 * (exposed as the `pending` sub-handle and flattened onto the root for
 * backward-compatible flat callers).
 *
 * When `activeSessionId` changes (user clicks a different sidebar row), the
 * previous EventSource is torn down and a new one is opened.
 *
 * The optional `sessionEvents` callback is invoked for every SSE event
 * touching the sessions list so the caller can patch SidebarSession[]
 * (see `createLiveSessions().patch`).
 */
export function createLiveTranscript(
  client: Client,
  activeSessionId: Accessor<string>,
  sessionEvents?: SessionEventSink & Partial<NotificationSink>,
): LiveTranscriptHandle {
  const {
    messages,
    setMessages,
    messagesLoading,
    setMessagesLoading,
    pendingPermission,
    setPendingPermission,
    status,
    setStatus,
    reconnectInSec,
    setReconnectInSec,
    lastCompletion,
    setLastCompletion,
    costUsd,
    setCostUsd,
    runningTools,
    setRunningTools,
    pendingQuestion,
    setPendingQuestion,
    semanticEvents,
    setSemanticEvents,
    executionEvents,
    setExecutionEvents,
    normalizedTranscript,
    setNormalizedTranscript,
    streamStats,
    setStreamStats,
  } = createLiveTranscriptSignals();
  // Bound inside the per-session effect (it closes over that session's
  // openEs/timers); exposed via the public reconnectNow() API.
  let reconnectNowRef: (() => void) | null = null;
  const streamStatsTracker = createStreamStatsTracker(setStreamStats);
  // Pending permission + ask-user question lifecycle lives in its own handle.
  const pending = createLivePendingInteractionsHandle({
    pendingPermission,
    setPendingPermission,
    pendingQuestion,
    setPendingQuestion,
  });

  createEffect(() => {
    const id = activeSessionId();
    // Stream stats are per-session - reset whenever the session changes
    // (including to "no session").
    streamStatsTracker.reset();
    // The semantic feed is per-session; clear it on every session switch so
    // events never bleed between conversations.
    const feedSetters = { setSemanticEvents, setExecutionEvents, setNormalizedTranscript };
    clearLiveTranscriptSessionFeeds(feedSetters);
    if (!id) {
      clearInactiveLiveTranscriptState({
        ...feedSetters,
        setMessages,
        setMessagesLoading,
        setPendingPermission,
        setStatus,
        setReconnectInSec,
        setLastCompletion,
        setCostUsd,
        setRunningTools,
        setPendingQuestion,
      });
      return;
    }

    const session = startLiveTranscriptSession({
      client,
      sessionId: id,
      signals: {
        setMessages,
        setMessagesLoading,
        // Route every pending-permission write through the owning sub-handle's
        // guarded setter so the 3 independent caller modules (settled status,
        // permission.resolved, session.cleared) share one ordering guard and a
        // stale re-request can't re-open a settled card.
        setPendingPermission: pending.setPendingPermission,
        setLastCompletion,
        setCostUsd,
        setRunningTools,
        setPendingQuestion,
        setSemanticEvents,
        setExecutionEvents,
        setNormalizedTranscript,
      },
      setStatus,
      setReconnectInSec,
      streamStatsTracker,
      sessionEvents,
    });

    // Manual reconnect (toast "Reconnect now" action): cancel any pending
    // backoff and reopen immediately. Resets the attempt counter so the
    // next failure starts the ladder from the bottom again.
    reconnectNowRef = () => {
      session.reconnectNow();
    };

    onCleanup(() => {
      reconnectNowRef = null;
      session.close();
    });
  });

  async function refetch(): Promise<void> {
    const id = activeSessionId();
    if (!id) return;
    const snapshot = await fetchLiveTranscriptSnapshot(client, id);
    // The transcript owns the message feed; the pending sub-handle reconciles
    // its own permission/question fields from the same snapshot.
    //
    // Key-based MERGE, not a wholesale replace: SSE mutations (e.g. a
    // `message.part.delta` text-append, `cost.updated`, `message.completed`)
    // can land *during* or just-after this in-flight fetch, and the snapshot is
    // stale for them. mergeMessages keeps the reconciled list authoritative
    // while preserving newer in-flight per-message streaming text/parts — the
    // same conflict-free merge the debounced reconciler already uses. The
    // no-in-flight case is unchanged: with no local-only mutations the merge
    // returns the reconciled snapshot verbatim.
    if (snapshot.messages) {
      const next = snapshot.messages;
      setMessages((prev) => mergeMessages(prev, next));
    }
    pending.reconcileFromSnapshot(snapshot);
  }

  return {
    messages,
    messagesLoading,
    pendingPermission: pending.pendingPermission,
    status,
    reconnectInSec,
    lastCompletion,
    costUsd,
    runningTools,
    pendingQuestion: pending.pendingQuestion,
    semanticEvents,
    executionEvents,
    normalizedTranscript,
    streamStats,
    refetch,
    reconnectNow: () => {
      // Don't tear down a healthy stream - only act when degraded.
      if (status() === 'open') return;
      reconnectNowRef?.();
    },
    clearPendingPermission: pending.clearPendingPermission,
    pending,
  };
}
