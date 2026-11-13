import type { Message } from '@clio/core/v3';
import { fireEvent, render, within } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { TranscriptTestAppearance as AppearanceProvider } from '@/test/transcript-test-appearance';
import type { ConversationMessageRowProps } from './conversation';
import {
  ConversationMessageRow,
  conversationMessageRowPropsEqual,
} from './conversation-message-row';

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
  it('updates a resumed response when its header continuity changes', () => {
    const base = baseRowProps();
    expect(conversationMessageRowPropsEqual(base, { ...base, responseContinuation: true })).toBe(
      false,
    );
  });
  it('updates this message when its mark changes and ignores unrelated marks', () => {
    const base = baseRowProps();
    expect(
      conversationMessageRowPropsEqual(base, { ...base, markedMessageIds: new Set(['message_1']) }),
    ).toBe(false);
    expect(
      conversationMessageRowPropsEqual(base, {
        ...base,
        markedMessageIds: new Set(['another_message']),
      }),
    ).toBe(true);
  });
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

function renderRow(element: ReactElement) {
  return render(
    <LazyMotion features={domAnimation}>
      <AppearanceProvider>
        <ConversationDisplayProvider>{element}</ConversationDisplayProvider>
      </AppearanceProvider>
    </LazyMotion>,
  );
}

it('offers Retry for a recoverable failure after partial output', () => {
  // A model call that timed out after streaming a thought: the service records it
  // recoverable with recovery "retry", so the reply line offers it.
  const onRetryMessage = vi.fn();
  const message = (error_info: Record<string, unknown>) => ({
    id: 'partial-timeout',
    session_id: 's',
    role: 'assistant' as const,
    created_at: '2026-11-12T07:34:31Z',
    stop_reason: 'error',
    error_info,
    blocks: [{ id: 'partial', type: 'text' as const, text: 'Listing the workspace first.' }],
  });
  const props = {
    index: 0,
    recent: false,
    displayMode: 'chain' as const,
    onDisplayModeChange: vi.fn(),
    onRetryMessage,
    artifacts: {},
    subagents: {},
    surfaces: {},
    tasks: {},
    tools: {},
  };
  const view = renderRow(
    <ConversationMessageRow
      {...props}
      message={message({
        error: 'provider_error',
        message: 'Claude Code: The model request timed out. Completed tool results are saved.',
        details: { reason: 'model_request_timeout', recovery_actions: ['retry'] },
        recoverable: true,
      })}
    />,
  );
  const line = view.container.querySelector('[data-slot="reply-error"]') as HTMLElement;
  expect(line).toHaveAttribute('title', expect.stringContaining('timed out'));
  fireEvent.click(within(line).getByRole('button', { name: 'Retry' }));
  expect(onRetryMessage).toHaveBeenCalledWith('partial-timeout');
  view.unmount();

  // The person's own cancellation is not offered again from the reply line.
  renderRow(
    <ConversationMessageRow
      {...props}
      message={message({
        error: 'cancelled',
        message: 'turn cancelled by client',
        recoverable: true,
      })}
    />,
  );
  expect(document.querySelector('[data-slot="reply-error"] button')).toBeNull();
});
