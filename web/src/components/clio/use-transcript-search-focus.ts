import type { Message } from '@clio/core/v3';
import type { Virtualizer } from '@tanstack/react-virtual';
import { useEffect, type RefObject } from 'react';
import { focusAttentionEvidence } from '@/lib/attention-evidence-navigation';
import { highlightSearchPassage } from '@/lib/search-passage';
import type { ConversationDisplayMode } from '@/providers/conversation-display-provider';

/**
 * Follows a `#message-…` search or evidence link: opens the matching turn in
 * full, reveals and highlights the passage, scrolls to it and focuses its row.
 */
export function useTranscriptSearchFocus({
  messages,
  virtualizer,
  scrollRef,
  markUserScrollIntent,
  disengage,
  revealDisclosure,
  searchHash,
  searchKey,
  setTurnDisplayMode,
}: {
  messages: readonly Message[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  scrollRef: RefObject<HTMLDivElement | null>;
  markUserScrollIntent: () => void;
  disengage: () => void;
  revealDisclosure?: (id: string, open: boolean) => void;
  searchHash?: string;
  searchKey?: string;
  setTurnDisplayMode: (messageId: string, mode: ConversationDisplayMode) => void;
}) {
  useEffect(() => {
    let frame = 0;
    let clearSearch: (() => void) | undefined;
    const focusSearchResult = () => {
      clearSearch?.();
      clearSearch = undefined;
      if (!window.location.hash.startsWith('#message-')) return;
      const [target, query] = window.location.hash.slice('#message-'.length).split('?', 2);
      const [encodedMessageId, encodedActivityId] = target.split('/activity-', 2);
      const messageId = decodeURIComponent(encodedMessageId);
      const activityId = encodedActivityId ? decodeURIComponent(encodedActivityId) : undefined;
      const parameters = new URLSearchParams(query);
      const find = parameters.get('find');
      const part = parameters.get('part');
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) return;
      if (find) {
        setTurnDisplayMode(messageId, 'full');
        if (part) {
          const message = messages[index];
          for (const field of ['text', 'thought'])
            revealDisclosure?.(
              `thinking:${message.session_id}:${messageId}:${part}:${field}`,
              true,
            );
        }
        if (scrollRef.current)
          clearSearch = highlightSearchPassage(scrollRef.current, messageId, part, find);
      }
      markUserScrollIntent();
      disengage();
      virtualizer.scrollToIndex(index, { align: 'center' });
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          if (focusAttentionEvidence(messageId, new URLSearchParams(query))) return;
          // A tool call's activity row is the landmark for its deep link.
          const activity = activityId ? document.getElementById(`tool-${activityId}`) : null;
          if (activity) {
            activity.scrollIntoView({ block: 'center' });
            activity.focus({ preventScroll: true });
          } else document.getElementById(`message-${messageId}`)?.focus({ preventScroll: true });
        });
      });
    };
    focusSearchResult();
    window.addEventListener('hashchange', focusSearchResult);
    return () => {
      clearSearch?.();
      window.removeEventListener('hashchange', focusSearchResult);
      window.cancelAnimationFrame(frame);
    };
  }, [
    messages,
    virtualizer,
    scrollRef,
    markUserScrollIntent,
    disengage,
    revealDisclosure,
    searchHash,
    searchKey,
    setTurnDisplayMode,
  ]);
}
