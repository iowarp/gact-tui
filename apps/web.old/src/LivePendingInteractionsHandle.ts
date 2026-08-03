/**
 * Pending-interaction lifecycle for the live transcript.
 *
 * `LiveTranscript` owns the SSE stream, reconciliation and resilience; this
 * focused sub-handle owns everything about the two *pending* user interactions
 * a session can surface — a permission request and an orchestrator ask-user
 * question. It holds their signals, knows how to clear them on session switch,
 * how to reconcile them from a refetched snapshot, and exposes the optimistic
 * `clearPendingPermission()` used after a successful resolve POST.
 *
 * It is exposed as the `pending` sub-handle of `LiveTranscriptHandle`; the same
 * accessors are also spread onto the handle's root so existing flat callers
 * (`transcript.pendingPermission`, `transcript.clearPendingPermission`) keep
 * working unchanged.
 */

import type { Accessor, Setter } from 'solid-js';
import type { PermissionRequest, UserQuestion } from '@clio/core';
import type { LiveTranscriptSnapshot } from './LiveTranscriptSnapshot.js';
import { mergeLiveTranscriptSnapshot } from './LiveTranscriptSnapshot.js';

/** The signals the pending-interactions handle reads from and writes to. */
export interface LivePendingInteractionsSignals {
  pendingPermission: Accessor<PermissionRequest | null>;
  setPendingPermission: Setter<PermissionRequest | null>;
  pendingQuestion: Accessor<UserQuestion | null>;
  setPendingQuestion: Setter<UserQuestion | null>;
}

/** Public surface for the pending permission + question lifecycle. */
export interface LivePendingInteractionsHandle {
  /** Currently pending permission request, or null. */
  pendingPermission: Accessor<PermissionRequest | null>;
  /** Currently pending orchestrator ask-user question (PR #380), or null. */
  pendingQuestion: Accessor<UserQuestion | null>;
  /** Clear both pending interactions (e.g. on session switch / inactive). */
  clear: () => void;
  /**
   * Reconcile the pending interactions from a refetched transcript snapshot.
   * Only the permission/question fields are touched; messages stay the caller's
   * concern.
   */
  reconcileFromSnapshot: (snapshot: LiveTranscriptSnapshot) => void;
  /**
   * Optimistically clear the pending permission card after a successful resolve
   * POST. The card must not depend on the `permission.resolved` SSE round-trip
   * alone — on the desktop the bridge/fallback stream can miss the event window
   * (found by the real-WebView e2e), and a 200 from the resolve endpoint
   * already proves the permission is settled.
   */
  clearPendingPermission: () => void;
  /**
   * The single guarded writer for the pending-permission signal. This handle is
   * the *owner* of the pending-permission lifecycle: every module that sets or
   * clears it ({@link LivePendingInteractions} on `permission.*`,
   * {@link LiveSessionEvents} on a settled session status,
   * {@link LiveRefreshEvents} on `session.cleared`) must route through this
   * setter rather than touching the raw signal, so there is one ordering guard.
   *
   * The guard rejects an invalid *set-after-resolved*: once a permission id has
   * been resolved/cleared, a late (stale) `permission.requested` carrying that
   * same id can no longer re-open the card. A clear always wins and records the
   * outgoing id as resolved. In-order `requested → resolved` behaviour is
   * unchanged.
   */
  setPendingPermission: (next: PermissionRequest | null) => void;
}

/**
 * Build the pending-interactions sub-handle over the transcript's existing
 * permission + question signals.
 */
export function createLivePendingInteractionsHandle(
  signals: LivePendingInteractionsSignals,
): LivePendingInteractionsHandle {
  // Lifecycle guard state. We remember the last permission id that was
  // resolved/cleared so a stale `permission.requested` re-delivery (no ordering
  // guarantee across the 3 caller modules) cannot re-open an already-settled
  // card. `null` means "no permission has been resolved yet this cycle".
  let lastResolvedId: string | null = null;

  /**
   * The one guarded writer all callers funnel through.
   *  - Clearing (`next == null`) always wins; it records the id of the card it
   *    tore down as resolved so a later stale re-request for it is rejected.
   *  - Setting a permission whose id was already resolved is rejected (the
   *    invalid set-after-resolved). A genuinely new id resets the cycle.
   */
  const setPendingPermission = (next: PermissionRequest | null): void => {
    if (next === null) {
      const current = signals.pendingPermission();
      if (current?.id != null) lastResolvedId = current.id;
      signals.setPendingPermission(null);
      return;
    }
    if (next.id != null && next.id === lastResolvedId) {
      // Stale re-request for a permission we already settled — drop it.
      return;
    }
    // A fresh permission opens a new cycle.
    lastResolvedId = null;
    signals.setPendingPermission(next);
  };

  return {
    pendingPermission: signals.pendingPermission,
    pendingQuestion: signals.pendingQuestion,
    setPendingPermission,
    clear: () => {
      setPendingPermission(null);
      signals.setPendingQuestion(null);
    },
    reconcileFromSnapshot: (snapshot) => {
      mergeLiveTranscriptSnapshot(snapshot, {
        // Messages are reconciled by the transcript itself; here we only
        // ever fold the pending fields, so the message setter is a no-op.
        setMessages: () => {},
        setPendingPermission,
        setPendingQuestion: signals.setPendingQuestion,
      });
    },
    clearPendingPermission: () => setPendingPermission(null),
  };
}
