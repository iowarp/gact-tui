import type { Message as DomainMessage } from '@clio/core/v3';

/** The metadata key a reply the restart's recovery produced carries: the turn it continues. */
export const RESUMES_TURN = 'resumes_turn';

/**
 * Interrupted replies the service's restart already resumed, mapped to the reply that
 * continued them. Read from stored state only: a recovery reply's `resumes_turn`
 * metadata names the turn it continues (clio-agent `restart_interruptions.RESUMES_TURN`).
 * Such a reply offers no Retry, which would ask again for work already under way.
 */
export function resumedReplies(messages: readonly DomainMessage[]): Map<string, string> {
  const resumed = new Map<string, string>();
  messages.forEach((message, index) => {
    const turn = message.role === 'assistant' ? message.metadata?.[RESUMES_TURN] : undefined;
    if (typeof turn !== 'string' || !turn) return;
    for (const earlier of messages.slice(0, index)) {
      if (earlier.role === 'assistant' && (earlier.run_id ?? earlier.turn_id) === turn) {
        resumed.set(earlier.id, message.id);
      }
    }
  });
  return resumed;
}
