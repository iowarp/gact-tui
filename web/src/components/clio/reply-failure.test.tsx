import type { Message } from '@clio/core/v3';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { TranscriptTestAppearance as AppearanceProvider } from '@/test/transcript-test-appearance';
import { ConversationMessageRow } from './conversation-message-row';
import { replyFailureCode, replyFailureReason, replyRecoveryPoints } from './reply-failure';

// The record the service keeps for a reply that failed on an unreadable saved context.
const foldFailure = {
  error: 'agent_error',
  message:
    'cannot fold the agent context: malformed_thinking at segment 0b31 (thought): not-a-list',
  details: {
    reason: 'context_fold_failed',
    problem: 'malformed_thinking',
    segment_id: '0b31',
    kind: 'thought',
    turn_id: 'turn_2',
  },
  recoverable: true,
};

function message(id: string, role: 'user' | 'assistant', extra: Partial<Message> = {}): Message {
  return {
    id,
    session_id: 's',
    role,
    created_at: '2026-11-15T22:49:00Z',
    blocks: role === 'user' ? [{ id: `${id}_t`, type: 'text', text: 'hi' }] : [],
    ...extra,
  };
}

const transcript: Message[] = [
  message('u1', 'user', { turn_id: 'turn_1' }),
  message('a1', 'assistant', {
    turn_id: 'turn_1',
    blocks: [{ id: 'a1_t', type: 'text', text: 'First answer' }],
  }),
  message('u2', 'user', { turn_id: 'turn_2' }),
  message('a2', 'assistant', {
    turn_id: 'turn_2',
    blocks: [{ id: 'a2_t', type: 'text', text: 'Second answer' }],
  }),
  message('u3', 'user', { turn_id: 'turn_3' }),
  message('a3', 'assistant', { turn_id: 'turn_3', stop_reason: 'error', error_info: foldFailure }),
];

function renderRow(element: ReactElement) {
  return render(
    <LazyMotion features={domAnimation}>
      <AppearanceProvider>
        <ConversationDisplayProvider>{element}</ConversationDisplayProvider>
      </AppearanceProvider>
    </LazyMotion>,
  );
}

const rowProps = {
  index: 5,
  recent: false,
  displayMode: 'chain' as const,
  onDisplayModeChange: vi.fn(),
  artifacts: {},
  subagents: {},
  surfaces: {},
  tasks: {},
  tools: {},
};

describe('reply failure reader', () => {
  it('reads the typed code under the generic error and words it for people', () => {
    expect(replyFailureCode(foldFailure)).toBe('context_fold_failed');
    expect(replyFailureReason('context_fold_failed', foldFailure.message)).toMatch(
      /saved history can’t be read back/,
    );
    // A short sentence from the service is kept; a code alone is humanized.
    expect(replyFailureReason('provider_error', 'The model is busy')).toBe('The model is busy.');
    expect(replyFailureReason('model_quota_exceeded', undefined)).toBe('Model quota exceeded');
    expect(replyFailureReason('agent_error', undefined)).toBeUndefined();
    // A message made of identifiers is not shown as the reason.
    expect(replyFailureReason('agent_error', foldFailure.message)).toBe(
      'The service hit an error.',
    );
  });

  it('names a fold failure recorded before the service carried its reason', () => {
    const legacy = { ...foldFailure, details: { problem: 'unanswered_call', segment_id: 'x' } };
    expect(replyFailureCode(legacy)).toBe('context_fold_failed');
  });

  it('offers no way out once the conversation answered again', () => {
    const answered = [
      ...transcript,
      message('u4', 'user'),
      message('a4', 'assistant', { blocks: [{ id: 'a4_t', type: 'text', text: 'Back again' }] }),
    ];
    expect(replyRecoveryPoints(answered).size).toBe(0);
  });

  it('goes back to before the turn that recorded the damage, and copies through the last good reply', () => {
    const points = replyRecoveryPoints(transcript);
    expect(points.get('a3')).toEqual({ rewindTo: 'a1', copyFrom: 'a2' });
    expect(points.has('a2')).toBe(false);
  });

  it('offers nothing to recover for an ordinary failure', () => {
    const other = transcript.map((row) =>
      row.id === 'a3'
        ? { ...row, error_info: { error: 'provider_error', message: 'Busy', recoverable: true } }
        : row,
    );
    expect(replyRecoveryPoints(other).size).toBe(0);
  });
});

describe('a reply that failed on the saved history', () => {
  it('shows the reason as text, the ways out, and the record only in Technical details', async () => {
    const onRewindToMessage = vi.fn(async () => undefined);
    const onForkFromMessage = vi.fn(async () => undefined);
    const view = renderRow(
      <ConversationMessageRow
        {...rowProps}
        message={transcript[5]!}
        onForkFromMessage={onForkFromMessage}
        onRewindToMessage={onRewindToMessage}
        onRetryMessage={vi.fn()}
        replyRecovery={{ rewindTo: 'a1', copyFrom: 'a2' }}
      />,
    );
    const line = view.container.querySelector('[data-slot="reply-error"]') as HTMLElement;
    expect(within(line).getByText('This reply didn’t load')).toBeVisible();
    // The reason is visible text, and the alert announces it.
    const reason = line.querySelector('[data-slot="reply-error-reason"]') as HTMLElement;
    expect(reason).toBeVisible();
    expect(reason).toHaveTextContent(/saved history can’t be read back/);
    expect(within(line).getByRole('alert')).toHaveTextContent(/saved history can’t be read back/);
    // The raw record and its codes are not in the primary text.
    expect(reason.textContent).not.toMatch(/context_fold_failed|malformed_thinking|segment/);
    expect(within(line).getByText('Technical details')).toBeVisible();

    fireEvent.click(
      within(line).getByRole('button', { name: /Go back to the last reply that worked/ }),
    );
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Go back' }));
    await vi.waitFor(() => expect(onRewindToMessage).toHaveBeenCalledWith('a1'));
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    const copy = within(line).getByRole('button', { name: /Continue in a copy/ });
    await vi.waitFor(() => expect(copy).toBeEnabled());
    fireEvent.click(copy);
    expect(onForkFromMessage).toHaveBeenCalledWith('a2');
  });

  it('keeps the plain line, without recovery actions, for other failures', () => {
    const view = renderRow(
      <ConversationMessageRow
        {...rowProps}
        message={message('a9', 'assistant', {
          stop_reason: 'error',
          error_info: { error: 'provider_error', message: 'The model is busy', recoverable: true },
        })}
        onRetryMessage={vi.fn()}
      />,
    );
    const line = view.container.querySelector('[data-slot="reply-error"]') as HTMLElement;
    const reason = line.querySelector('[data-slot="reply-error-reason"]') as HTMLElement;
    expect(reason).toBeVisible();
    expect(reason).toHaveTextContent('The model is busy.');
    expect(line.querySelector('[data-slot="reply-recovery"]')).toBeNull();
    expect(within(line).getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});
