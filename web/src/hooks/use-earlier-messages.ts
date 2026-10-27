import { useCallback, useMemo, useState } from 'react';
import { recordById } from '@/lib/entities';
import { TRANSCRIPT_PAGE_SIZE } from '@/lib/runtime-limits';
import { useLiveStore } from '@/store/live-store';
import { useRepository } from './use-repository';

/** What the conversation view needs to load older messages on scroll. */
export interface EarlierMessages {
  hasEarlier: boolean;
  loading: boolean;
  error?: string;
  load: () => void;
}

interface LoadState {
  sessionId: string;
  /** The oldest message id when the conversation's start was reached. */
  startId?: string;
  loading: boolean;
  error?: string;
}

/**
 * Loads the messages before the oldest one on screen, a page at a time.
 *
 * Opening a conversation reads only its newest page; each older page merges into
 * the live store, where the conversation already reads its messages. The cursor is
 * the oldest message held, so a reconcile that drops older pages resumes from what
 * is left rather than from a stale position.
 */
export function useEarlierMessages(
  sessionId: string | undefined,
  firstPageHasMore: boolean,
  oldestMessageId: string | undefined,
): EarlierMessages {
  const repository = useRepository();
  const mergeSnapshots = useLiveStore((state) => state.mergeSnapshots);
  const [raw, setState] = useState<LoadState>({ sessionId: sessionId ?? '', loading: false });
  const state = useMemo<LoadState>(
    () => (raw.sessionId === sessionId ? raw : { sessionId: sessionId ?? '', loading: false }),
    [raw, sessionId],
  );
  const hasEarlier =
    Boolean(sessionId) &&
    firstPageHasMore &&
    oldestMessageId !== undefined &&
    state.startId !== oldestMessageId;
  const { loading } = state;
  const load = useCallback(() => {
    if (!sessionId || !oldestMessageId || !hasEarlier || loading) return;
    setState({ ...state, sessionId, loading: true, error: undefined });
    repository
      .transcript(sessionId, undefined, { limit: TRANSCRIPT_PAGE_SIZE, before: oldestMessageId })
      .then((page) => {
        // A page that adds nothing (every message already held) cannot move the
        // cursor: stop here instead of requesting the same page again.
        const held = useLiveStore.getState().entities.messages;
        const adds = page.messages.some((message) => !(message.id in held));
        mergeSnapshots({
          messages: recordById(page.messages),
          tools: recordById(page.tools),
          tasks: recordById(page.tasks),
          subagents: recordById(page.subagents),
          surfaces: recordById(page.surfaces),
        });
        setState({
          sessionId,
          loading: false,
          startId: !page.next_cursor
            ? (page.messages[0]?.id ?? oldestMessageId)
            : adds
              ? undefined
              : oldestMessageId,
        });
      })
      .catch((error: unknown) => {
        setState({
          ...state,
          sessionId,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, [hasEarlier, loading, mergeSnapshots, oldestMessageId, repository, sessionId, state]);
  return { hasEarlier, loading, error: state.error, load };
}
