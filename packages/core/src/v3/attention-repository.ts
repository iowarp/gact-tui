import type {
  AttentionProfile,
  AttentionResult,
  AttentionSessionAvailability,
} from './attention-domain.js';
import { attentionResultSchema, attentionSessionAvailabilitySchema } from './attention-schemas.js';
import { SessionHistoryRepository } from './session-history-repository.js';
import {
  attentionLookupResultSchema,
  type AttentionLookupDirection,
  type AttentionLookupResult,
} from './attention-lookup-contract.js';
import type { ContentSelection } from './storage-contract.js';

/**
 * "Understand attention": which earlier transcript text the model drew on to
 * produce a selected span of a rendered answer (clio-agent `POST
 * /v1/sessions/{sid}/messages/{mid}/attention`, branch `feat/attention-view`,
 * #1490). Both endpoints below always answer 200 — an unavailable result is
 * `{available: false, message}`, never a thrown error, so a caller only needs
 * to branch on `available`.
 */
export class AttentionRepository extends SessionHistoryRepository {
  public lookupAttention(
    sessionId: string,
    input: {
      selections: ContentSelection[];
      direction: AttentionLookupDirection;
      profile?: AttentionProfile;
      cursor?: number;
    },
    signal?: AbortSignal,
  ): Promise<AttentionLookupResult> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/attention/lookup`,
      body: input,
      signal,
      decode: (value) => attentionLookupResultSchema.parse(value),
    });
  }

  public getAttention(
    sessionId: string,
    messageId: string,
    selection: {
      text: string;
      part_id?: string;
      content_revision?: string;
      field?: string;
      start?: number;
      end?: number;
      profile?: AttentionProfile;
    },
    signal?: AbortSignal,
  ): Promise<AttentionResult> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/attention`,
      body: selection,
      decode: (value) => attentionResultSchema.parse(value),
      signal,
    });
  }

  /**
   * Whether this session can show attention, and for which answers. Cheap on
   * the service: config, the recorded model calls and one Flowcept query.
   */
  public attentionAvailability(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<AttentionSessionAvailability> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/attention/availability`,
      decode: (value) => attentionSessionAvailabilitySchema.parse(value),
      signal,
    });
  }
}
