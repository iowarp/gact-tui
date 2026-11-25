import { describe, expect, it } from 'vitest';
import type { Message } from '@clio/core/v3';
import { conversationTurnPresentation } from './conversation-turn-model';
import { replyEnding } from './reply-ending';

function restarted(details: Record<string, unknown> = {}): Message {
  return {
    id: 'assistant_restarted',
    session_id: 'session_1',
    run_id: 'turn_restarted',
    role: 'assistant',
    created_at: '2026-08-24T00:00:00Z',
    completed_at: '2026-08-24T00:01:00Z',
    stop_reason: 'error',
    error_info: {
      error: 'server_restart_interrupted',
      message: 'The agent service restarted before this response completed.',
      details: { reason: 'server_restart_interrupted', ...details },
      recoverable: !details.resuming,
    },
    blocks: [
      {
        id: 'partial_thought',
        type: 'text',
        text: 'Resolve the region first.',
        channel: 'next_thought',
      },
    ],
  };
}

describe('replyEnding after a restart', () => {
  it('leaves the interruption to the reply notice, with no second chip (#54)', () => {
    expect(conversationTurnPresentation(restarted(), {}).iterations[0]).toMatchObject({
      interrupted: false,
    });
  });

  it('offers Retry when recovery does not resume the reply', () => {
    expect(replyEnding(restarted())).toMatchObject({
      interruptedByService: true,
      failureReason: expect.stringMatching(/agent service restarted.*retry it/),
      retryable: true,
    });
  });

  it('says a resuming reply continues on its own and offers no Retry', () => {
    expect(replyEnding(restarted({ resuming: true }))).toMatchObject({
      failureReason: expect.stringMatching(/agent service restarted.*continuing on its own/),
      retryable: false,
    });
  });

  it('points at the continuation once the resumed reply exists', () => {
    expect(replyEnding(restarted({ resuming: true }), 'assistant_resumed')).toMatchObject({
      failureReason: expect.stringMatching(/continued below/),
      retryable: false,
    });
  });
});
