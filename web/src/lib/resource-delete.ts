import { TransportError } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';

/**
 * The words for a refused delete, from the service's error code.
 *
 * The service settles a stopped conversation's held request itself, so a refusal for
 * active work means work a conversation started is still running. Removing a
 * workspace deletes its conversations, so it waits for the same work.
 */
export function deleteFailure(error: unknown): string {
  if (error instanceof TransportError && error.code === 'session_has_active_work') {
    return 'Work this conversation started is still running. Wait for it to finish or cancel it, then delete the conversation.';
  }
  if (error instanceof TransportError && error.code === 'workspace_has_active_work') {
    return `Work started by a conversation in this ${vocab.workspace} is still running. Wait for it to finish or cancel it, then remove the ${vocab.workspace}.`;
  }
  return error instanceof Error ? error.message : String(error);
}
