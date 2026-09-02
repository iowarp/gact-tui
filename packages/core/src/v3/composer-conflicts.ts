import type { QueuedMessage } from './composer-domain.js';

/**
 * Raised when the service refuses a queued-message reorder because the queue it
 * holds no longer matches the one the drag started from.
 *
 * The client never replays the stale order over the newer queue: doing so would
 * launder the request past the revision guard the service uses to protect a
 * concurrent writer, and would report a reorder that the user never saw. The
 * error instead carries the order the service actually holds so the surface can
 * reconcile what it shows and say why the drag did not land.
 */
export class QueuedMessageReorderConflictError extends Error {
  /** Stable machine-readable reason, safe to branch on in a surface. */
  public readonly reason = 'queued_messages_changed' as const;

  public constructor(
    /** The queue as the service holds it, read back after the refusal. */
    public readonly queuedMessages: QueuedMessage[],
    /** The service's own refusal text, preserved for the trace. */
    public readonly serviceMessage: string,
  ) {
    super('The queued messages changed on the service, so the new order was not applied.');
    this.name = 'QueuedMessageReorderConflictError';
  }
}
