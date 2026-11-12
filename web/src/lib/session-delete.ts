import { TransportError } from '@clio/core/v3';

/**
 * The words for a refused delete, from the service's error code.
 *
 * The service settles a stopped conversation's held request itself, so a refusal for
 * active work means work the conversation started is still running.
 */
export function sessionDeleteFailure(error: unknown): string {
  if (error instanceof TransportError && error.code === 'session_has_active_work') {
    return 'Work this conversation started is still running. Wait for it to finish or cancel it, then delete the conversation.';
  }
  return error instanceof Error ? error.message : String(error);
}
