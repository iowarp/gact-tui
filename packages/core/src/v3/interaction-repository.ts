import type { PendingInteraction, PendingInteractionResponse } from './interaction-domain.js';
import { pendingInteractionListSchema } from './repository-decoders.js';
import { ComposerRepository } from './composer-repository.js';

/** Normalized human-interaction projection and response routing. */
export class InteractionRepository extends ComposerRepository {
  /** Lists interactions attended by a root session and, optionally, its descendants. */
  public async pendingInteractions(
    rootSessionId: string,
    includeChildren = true,
    signal?: AbortSignal,
  ): Promise<PendingInteraction[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(rootSessionId)}/interactions?include_children=${includeChildren}&include_recent_resolved=true&resolved_limit=20`,
      decode: (value) => pendingInteractionListSchema.parse(value),
      signal,
    });
    return result.interactions;
  }

  /** Routes a response to the authoritative interaction owner through its attended root. */
  public respondInteraction(
    rootSessionId: string,
    interactionId: string,
    response: PendingInteractionResponse,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(rootSessionId)}/interactions/${encodeURIComponent(interactionId)}/respond`,
      body: response,
      decode: (value) => value,
      signal,
    });
  }
}
