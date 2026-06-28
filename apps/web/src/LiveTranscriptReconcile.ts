/**
 * Debounced transcript reconciler: coalesces SSE-triggered refetches of the
 * message list (and sessions) into a single delayed `client.messages` call.
 * Exports {@link createTranscriptReconciler}.
 */
import { mergeMessages, type Client, type Message } from '@clio/core';
import type { Setter } from 'solid-js';

export interface TranscriptReconciler {
  schedule: () => void;
  cancel: () => void;
}

export function createTranscriptReconciler(options: {
  client: Client;
  sessionId: string;
  setMessages: Setter<Message[]>;
  isDisposed: () => boolean;
  refetchSessions?: () => void;
  delayMs?: number;
}): TranscriptReconciler {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    if (options.isDisposed()) return;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      if (options.isDisposed()) return;
      void options.client
        .messages(options.sessionId)
        // Key-based MERGE, not a wholesale replace: SSE mutations (e.g. a
        // `message.part.delta` text-append) can land *during* this in-flight
        // fetch, and the snapshot is stale for them. mergeMessages keeps the
        // reconciled list authoritative while preserving newer local-only
        // parts/messages and in-flight per-message streaming text.
        .then(({ messages }) =>
          options.setMessages((prev) => mergeMessages(prev, messages)),
        )
        .catch(() => undefined);
      options.refetchSessions?.();
    }, options.delayMs ?? 250);
  }

  return { schedule, cancel };
}
