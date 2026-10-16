import type { Message } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TranscriptTestAppearance } from '@/test/transcript-test-appearance';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { copyText } from '@/lib/clipboard';
import { ClioConversation } from './conversation';
import { ClioMotionProvider } from './motion';
import { canGroupUserMessages } from './conversation-user-group';

vi.mock('@/lib/clipboard', () => ({ copyText: vi.fn().mockResolvedValue(undefined) }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function message(id: string, role: Message['role'] = 'user'): Message {
  return {
    id,
    role,
    session_id: 's',
    created_at: '2026-10-15T18:00:00Z',
    blocks: [{ id: `${id}-text`, type: 'text', text: id }],
  };
}

it('groups three pending steers under one sender while preserving each copy and cancel action', () => {
  const onCancel = vi.fn().mockResolvedValue(undefined);
  const messages = ['first', 'second', 'third'].map((id) => message(id));
  const view = render(
    <TranscriptTestAppearance>
      <ConversationDisplayProvider>
        <ClioMotionProvider>
          <ClioConversation
            messages={messages}
            tools={{}}
            tasks={{}}
            subagents={{}}
            artifacts={{}}
            surfaces={{}}
            pendingMessageIds={new Set(messages.map((row) => row.id))}
            cancellablePendingMessageIds={new Set(messages.map((row) => row.id))}
            onCancelPendingSteer={onCancel}
          />
        </ClioMotionProvider>
      </ConversationDisplayProvider>
    </TranscriptTestAppearance>,
  );
  expect(screen.getAllByText('You', { exact: true })).toHaveLength(1);
  expect(view.container.querySelectorAll('[data-user-continuation="true"]')).toHaveLength(2);
  for (const row of messages)
    expect(view.container.querySelector(`#message-${row.id}`)).not.toBeNull();
  const copies = screen.getAllByRole('button', { name: 'Copy message' });
  expect(copies).toHaveLength(3);
  fireEvent.click(copies[1]);
  expect(copyText).toHaveBeenCalledWith('second');
  const cancels = screen.getAllByRole('button', { name: 'Cancel pending message' });
  expect(cancels).toHaveLength(3);
  fireEvent.click(cancels[2]);
  expect(onCancel).toHaveBeenCalledWith('third');
});

it('groups consumed steers only when they share an adjacent delivery boundary', async () => {
  const assistant = message('owner', 'assistant');
  assistant.blocks = [
    { id: 'before', type: 'text', text: 'Earlier work.' },
    { id: 'between', type: 'text', text: 'After first delivery.' },
    { id: 'after', type: 'text', text: 'Corrected answer.' },
  ];
  const steers = ['first', 'second', 'third'].map((id, index) => ({
    ...message(id),
    metadata: {
      steer_delivery: {
        assistant_message_id: 'owner',
        after_part_id: index === 2 ? 'between' : 'before',
      },
    },
  }));
  const view = render(
    <TranscriptTestAppearance>
      <ConversationDisplayProvider>
        <ClioMotionProvider>
          <ClioConversation
            messages={[assistant, ...steers]}
            tools={{}}
            tasks={{}}
            subagents={{}}
            artifacts={{}}
            surfaces={{}}
          />
        </ClioMotionProvider>
      </ConversationDisplayProvider>
    </TranscriptTestAppearance>,
  );
  expect(screen.getAllByText('You', { exact: true })).toHaveLength(2);
  expect(view.container.querySelectorAll('[data-user-continuation="true"]')).toHaveLength(1);
  expect(
    view.container
      .querySelector('#message-first')
      ?.compareDocumentPosition(view.container.querySelector('#message-second')!),
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  await waitFor(() => expect(screen.getByText('After first delivery.')).toBeVisible());
  expect(screen.getAllByRole('button', { name: 'Copy message' }).length).toBeGreaterThanOrEqual(3);
});

it('does not group across a different session, execution mode, or response envelope', () => {
  const first = message('first');
  expect(canGroupUserMessages(first, message('second'))).toBe(true);
  expect(canGroupUserMessages(first, { ...message('second'), session_id: 'other' })).toBe(false);
  expect(canGroupUserMessages(first, message('assistant', 'assistant'))).toBe(false);
  expect(
    canGroupUserMessages(first, {
      ...message('second'),
      metadata: { behavior: { execution_mode: 'plan' } },
    }),
  ).toBe(false);
  expect(
    canGroupUserMessages(first, { ...message('second'), metadata: { ask_user_resume: true } }),
  ).toBe(false);
  expect(
    canGroupUserMessages(
      {
        ...first,
        metadata: { steer_delivery: { assistant_message_id: 'owner', after_part_id: 'x' } },
      },
      {
        ...message('second'),
        metadata: { steer_delivery: { assistant_message_id: 'owner', after_part_id: 'y' } },
      },
    ),
  ).toBe(false);
});
