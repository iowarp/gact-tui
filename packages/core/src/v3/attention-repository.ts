import type { AttentionResult } from './attention-domain.js';
import { attentionResultSchema } from './attention-schemas.js';
import { SessionHistoryRepository } from './session-history-repository.js';

/**
 * "Understand attention": which earlier transcript text the model drew on to
 * produce a selected span of a rendered answer (clio-agent `POST
 * /v1/sessions/{sid}/messages/{mid}/attention`, branch `feat/attention-view`,
 * #1490). Both endpoints below always answer 200 — an unavailable result is
 * `{available: false, message}`, never a thrown error, so a caller only needs
 * to branch on `available`.
 */
export class AttentionRepository extends SessionHistoryRepository {
  public getAttention(
    sessionId: string,
    messageId: string,
    selection: { text: string; part_id?: string; field?: string; start?: number; end?: number },
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

  /** Cheap pre-check: whether an attention view could be produced at all, without computing it. */
  public attentionAvailability(
    sessionId: string,
    messageId: string,
    signal?: AbortSignal,
  ): Promise<AttentionResult> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/attention/availability`,
      decode: (value) => attentionResultSchema.parse(value),
      signal,
    });
  }
}
