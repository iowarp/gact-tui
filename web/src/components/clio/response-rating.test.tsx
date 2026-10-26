import type { Message, ResponseFeedbackState } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponseRating } from './response-rating';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  readOnly: false,
  near: true,
}));
vi.mock('@/hooks/use-near-viewport', () => ({ useNearViewport: () => mocks.near }));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ responseFeedback: mocks.read, rateResponse: mocks.save }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://localhost:8100' },
    readOnly: mocks.readOnly,
  }),
}));
vi.mock('sonner', () => ({
  toast: { dismiss: vi.fn(), success: mocks.success, error: mocks.error },
}));

const message: Message = {
  id: 'answer',
  session_id: 'session',
  role: 'assistant',
  created_at: '2026-10-10T00:00:00Z',
  stop_reason: 'end_turn',
  blocks: [{ id: 'text', type: 'text', text: '42.' }],
};
const good: ResponseFeedbackState = {
  feedback: {
    schema_version: 1,
    feedback_id: 'ab821eb0-45cb-4713-a1d9-3746cb155c82',
    previous_feedback_id: null,
    rating: 'good',
    created_at: message.created_at,
    session_id: message.session_id,
    message_id: message.id,
    turn_id: 'question',
    workspace_id: 'workspace',
    prompt_message_id: 'question',
    prompt_text: '6 times 7?',
    response_text: '42.',
    response_sha256: 'hash',
    message_created_at: message.created_at,
    stop_reason: 'end_turn',
    model_ref: {},
    model_ref_source: 'unknown',
    source: 'user',
  },
};
function mount(value = message, active = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ResponseRating message={value} active={active} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readOnly = false;
  mocks.near = true;
  mocks.read.mockResolvedValue({ feedback: null });
});
afterEach(cleanup);

describe('response rating', () => {
  it('does not read feedback for offscreen messages', async () => {
    mocks.near = false;
    mount();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('saves a good rating only after acknowledgement and restores it on remount', async () => {
    const user = userEvent.setup();
    let acknowledge!: (value: ResponseFeedbackState) => void;
    mocks.save.mockReturnValue(
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
    );
    const view = mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Rate response' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Rate response' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Good response' }));
    expect(mocks.save).toHaveBeenCalledWith('session', 'answer', {
      feedback_id: expect.any(String),
      expected_feedback_id: null,
      rating: 'good',
    });
    expect(screen.getByRole('button', { name: 'Saving response rating' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Rated good response' })).not.toBeInTheDocument();
    acknowledge(good);
    await screen.findByRole('button', { name: 'Rated good response' });
    view.unmount();
    mocks.read.mockResolvedValue(good);
    mount();
    await screen.findByRole('button', { name: 'Rated good response' });
  });

  it('changes and removes an existing rating using the stored revision', async () => {
    const user = userEvent.setup();
    mocks.read.mockResolvedValue(good);
    const bad = {
      feedback: {
        ...good.feedback!,
        rating: 'bad' as const,
        feedback_id: '8d172815-de31-48f7-a688-d2ddf8a0d045',
      },
    };
    mocks.save
      .mockResolvedValueOnce(bad)
      .mockResolvedValueOnce({ feedback: { ...bad.feedback, rating: null } });
    mount();
    await user.click(await screen.findByRole('button', { name: 'Rated good response' }));
    expect(screen.getByRole('menuitemradio', { name: 'Good response' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('menuitemradio', { name: 'Bad response' }));
    expect(mocks.save).toHaveBeenLastCalledWith(
      'session',
      'answer',
      expect.objectContaining({
        expected_feedback_id: good.feedback!.feedback_id,
        rating: 'bad',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Rated bad response' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Bad response' }));
    await screen.findByRole('button', { name: 'Rate response' });
    expect(mocks.save).toHaveBeenLastCalledWith(
      'session',
      'answer',
      expect.objectContaining({
        expected_feedback_id: bad.feedback.feedback_id,
        rating: null,
      }),
    );
  });

  it('keeps the confirmed rating on failure and exposes read errors for retry', async () => {
    const user = userEvent.setup();
    mocks.read.mockResolvedValue(good);
    mocks.save.mockRejectedValue(new Error('503'));
    mount();
    await user.click(await screen.findByRole('button', { name: 'Rated good response' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Bad response' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Rated good response' })).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    cleanup();
    mocks.read.mockRejectedValue(new Error('offline'));
    mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Rate response' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Rate response' }));
    expect(screen.getByRole('menuitem', { name: 'Retry loading rating' })).toBeInTheDocument();
  });

  it('supports keyboard selection', async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValue({ feedback: { ...good.feedback!, rating: 'bad' } });
    mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Rate response' })).toBeEnabled(),
    );
    await user.tab();
    await user.keyboard('{Enter}{End}{Enter}');
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        'session',
        'answer',
        expect.objectContaining({ rating: 'bad' }),
      ),
    );
  });

  it.each(['good', 'bad'] as const)(
    'clears a checked %s rating when selected again',
    async (rating) => {
      mocks.read.mockResolvedValue({ feedback: { ...good.feedback!, rating } });
      mocks.save.mockResolvedValue({ feedback: { ...good.feedback!, rating: null } });
      const user = userEvent.setup();
      mount();
      await user.click(await screen.findByRole('button', { name: `Rated ${rating} response` }));
      await user.click(
        screen.getByRole('menuitemradio', {
          name: rating === 'good' ? 'Good response' : 'Bad response',
        }),
      );
      await screen.findByRole('button', { name: 'Rate response' });
      expect(mocks.save).toHaveBeenCalledWith(
        'session',
        'answer',
        expect.objectContaining({
          rating: null,
          expected_feedback_id: good.feedback!.feedback_id,
        }),
      );
    },
  );

  it('attaches a comment only after acknowledgement and restores it for editing', async () => {
    mocks.read.mockResolvedValue(good);
    let acknowledge!: (value: ResponseFeedbackState) => void;
    mocks.save.mockReturnValue(
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
    );
    const user = userEvent.setup();
    const view = mount();
    await user.click(await screen.findByRole('button', { name: 'Rated good response' }));
    await user.click(screen.getByRole('menuitem', { name: 'Add feedback comment' }));
    await user.type(screen.getByRole('textbox', { name: 'Comment' }), 'Clear units and sources.');
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));
    expect(mocks.save).toHaveBeenCalledWith(
      'session',
      'answer',
      expect.objectContaining({
        expected_feedback_id: good.feedback!.feedback_id,
        rating: 'good',
        comment: 'Clear units and sources.',
      }),
    );
    expect(screen.getByRole('button', { name: 'Saving feedback…' })).toBeDisabled();
    const commented = { feedback: { ...good.feedback!, comment: 'Clear units and sources.' } };
    acknowledge(commented);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    view.unmount();
    mocks.read.mockResolvedValue(commented);
    mount();
    await user.click(
      await screen.findByRole('button', { name: 'Rated good response, with comment' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Edit feedback comment' }));
    expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveValue(
      'Clear units and sources.',
    );
    await user.clear(screen.getByRole('textbox', { name: 'Comment' }));
    mocks.save.mockResolvedValue(good);
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenLastCalledWith(
        'session',
        'answer',
        expect.objectContaining({ comment: '', rating: 'good' }),
      ),
    );
  });

  it('keeps an unconfirmed comment for retry and can attach it without a thumb rating', async () => {
    mocks.save.mockRejectedValueOnce(new Error('storage unavailable'));
    const user = userEvent.setup();
    mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Rate response' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Rate response' }));
    await user.click(screen.getByRole('menuitem', { name: 'Add feedback comment' }));
    await user.type(screen.getByRole('textbox', { name: 'Comment' }), 'Missing units.');
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your comment is still here');
    expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveValue('Missing units.');
    mocks.save.mockResolvedValue({
      feedback: { ...good.feedback!, rating: null, comment: 'Missing units.' },
    });
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));
    await screen.findByRole('button', { name: 'Rate response, with comment' });
    expect(mocks.save).toHaveBeenLastCalledWith(
      'session',
      'answer',
      expect.objectContaining({ rating: null, comment: 'Missing units.' }),
    );
  });

  it('hides rating for user, active, unfinished and offline archive messages', () => {
    const view = mount({ ...message, role: 'user' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    view.unmount();
    const active = mount(message, true);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    active.unmount();
    const unfinished = mount({ ...message, stop_reason: undefined });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unfinished.unmount();
    mocks.readOnly = true;
    mount();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
