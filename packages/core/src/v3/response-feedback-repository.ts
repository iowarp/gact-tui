import { z } from 'zod';
import { SystemRepository } from './system-repository.js';
import {
  responseFeedbackSchema,
  responseFeedbackStateSchema,
  type RateResponseInput,
  type ResponseFeedback,
  type ResponseFeedbackState,
} from './response-feedback.js';

/** Response evaluation data scoped to the connected service and exact message. */
export class ResponseFeedbackRepository extends SystemRepository {
  public responseFeedback(
    sessionId: string,
    messageId: string,
    signal?: AbortSignal,
  ): Promise<ResponseFeedbackState> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/feedback`,
      decode: (value) => responseFeedbackStateSchema.parse(value),
      signal,
    });
  }

  public rateResponse(
    sessionId: string,
    messageId: string,
    input: RateResponseInput,
    signal?: AbortSignal,
  ): Promise<ResponseFeedbackState> {
    return this.transport.request({
      method: 'PUT',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/feedback`,
      body: input,
      decode: (value) => responseFeedbackStateSchema.parse(value),
      signal,
    });
  }

  public responseFeedbackHistory(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<ResponseFeedback[]> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/response-feedback`,
      decode: (value) => z.object({ items: z.array(responseFeedbackSchema) }).parse(value).items,
      signal,
    });
  }
}
