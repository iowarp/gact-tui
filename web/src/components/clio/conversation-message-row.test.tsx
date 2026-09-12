import type { Message } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import type { ConversationMessageRowProps } from './conversation';
import { conversationMessageRowPropsEqual } from './conversation-message-row';

function baseRowProps(): ConversationMessageRowProps {
  const message: Message = {
    id: 'message_1',
    session_id: 'session_1',
    role: 'user',
    created_at: '2026-09-02T00:00:00Z',
    blocks: [],
  };
  return {
    artifacts: {},
    displayMode: 'full',
    index: 0,
    message,
    onDisplayModeChange: () => undefined,
    recent: false,
    subagents: {},
    surfaces: {},
    tasks: {},
    tools: {},
  };
}

describe('conversationMessageRowPropsEqual', () => {
  it('treats a fresh onOpenReference as a real prop change, not a skippable re-render', () => {
    // Every OTHER prop, message included, is the exact same reference on both
    // sides — the only thing that changed between renders is the callback.
    const base = baseRowProps();
    const left = { ...base, onOpenReference: () => undefined };
    const right = { ...base, onOpenReference: () => undefined };

    expect(conversationMessageRowPropsEqual(left, right)).toBe(false);
  });

  it('still skips the re-render when every compared prop, onOpenReference included, is stable', () => {
    const onOpenReference = () => undefined;
    const shared = { ...baseRowProps(), onOpenReference };

    expect(conversationMessageRowPropsEqual(shared, { ...shared })).toBe(true);
  });
});
