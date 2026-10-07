import { describe, expect, it } from 'vitest';
import { messageSchema } from './message-schemas.js';

const message = {
  id: 'prompt',
  session_id: 'session',
  role: 'user',
  created_at: '2026-10-06T12:00:00Z',
  blocks: [],
};

describe('recorded message model', () => {
  it('preserves historical identity on decode and accepts older messages without attribution', () => {
    expect(
      messageSchema.parse({ ...message, model: { provider_id: 'codex', model_id: 'gpt-6-luna' } })
        .model,
    ).toEqual({ provider_id: 'codex', model_id: 'gpt-6-luna' });
    expect(messageSchema.parse(message).model).toBeUndefined();
    expect(messageSchema.safeParse({ ...message, model: { provider_id: 'codex' } }).success).toBe(
      false,
    );
  });
});
