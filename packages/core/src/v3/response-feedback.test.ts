import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';

const feedback = {
  schema_version: 1,
  feedback_id: 'd2e28c62-c3f2-4334-a6a4-49a7d810f528',
  previous_feedback_id: null,
  rating: 'good',
  created_at: '2026-10-10T00:00:00Z',
  session_id: 'sess 1',
  message_id: 'msg/1',
  turn_id: 'prompt',
  workspace_id: 'workspace',
  prompt_message_id: 'prompt',
  prompt_text: 'Question',
  response_text: 'Answer',
  response_sha256: 'recorded_hash',
  message_created_at: '2026-10-10T00:00:00Z',
  stop_reason: 'end_turn',
  model_ref: {},
  model_ref_source: 'unknown',
  source: 'user',
};

describe('response feedback repository', () => {
  it('reads, writes and exports server-backed feedback with scoped ids', async () => {
    const transport = new RecordingTransport([
      { feedback: null },
      { feedback },
      { items: [feedback] },
    ]);
    const repository = new ClioRepository(transport);
    expect(await repository.responseFeedback('sess 1', 'msg/1')).toEqual({ feedback: null });
    const input = {
      feedback_id: feedback.feedback_id,
      expected_feedback_id: null,
      rating: 'good' as const,
    };
    expect(await repository.rateResponse('sess 1', 'msg/1', input)).toEqual({ feedback });
    expect(await repository.responseFeedbackHistory('sess 1')).toEqual([feedback]);
    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: 'GET', path: '/v1/sessions/sess%201/messages/msg%2F1/feedback', body: undefined },
      { method: 'PUT', path: '/v1/sessions/sess%201/messages/msg%2F1/feedback', body: input },
      { method: 'GET', path: '/v1/sessions/sess%201/response-feedback', body: undefined },
    ]);
  });

  it('rejects invalid acknowledgements and propagates storage failures', async () => {
    const repository = new ClioRepository(
      new RecordingTransport([
        { feedback: { ...feedback, rating: 'great' } },
        new Error('clio-core unavailable'),
      ]),
    );
    await expect(repository.responseFeedback('s', 'm')).rejects.toThrow();
    await expect(
      repository.rateResponse('s', 'm', {
        feedback_id: feedback.feedback_id,
        expected_feedback_id: null,
        rating: 'bad',
      }),
    ).rejects.toThrow('clio-core unavailable');
  });
});
