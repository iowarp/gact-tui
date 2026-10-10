import { z } from 'zod';

/** Evaluation evidence written to ARC/clio-core, never browser-only state. */
export const responseFeedbackSchema = z.object({
  schema_version: z.literal(1),
  feedback_id: z.string().uuid(),
  previous_feedback_id: z.string().uuid().nullable(),
  rating: z.enum(['good', 'bad']).nullable(),
  created_at: z.string(),
  session_id: z.string(),
  message_id: z.string(),
  turn_id: z.string(),
  workspace_id: z.string(),
  prompt_message_id: z.string(),
  prompt_text: z.string(),
  response_text: z.string(),
  response_sha256: z.string(),
  message_created_at: z.string(),
  stop_reason: z.string(),
  model_ref: z.record(z.string()),
  model_ref_source: z.enum(['message', 'prompt_selection', 'unknown']),
  source: z.literal('user'),
});

export const responseFeedbackStateSchema = z.object({
  feedback: responseFeedbackSchema.nullable(),
});
export type ResponseFeedback = z.infer<typeof responseFeedbackSchema>;
export type ResponseFeedbackState = z.infer<typeof responseFeedbackStateSchema>;
export interface RateResponseInput {
  feedback_id: string;
  expected_feedback_id: string | null;
  rating: 'good' | 'bad' | null;
}
