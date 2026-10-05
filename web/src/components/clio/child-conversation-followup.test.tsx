import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChildConversationFollowup } from './child-conversation-followup';

const mocks = vi.hoisted(() => ({
  settings: { endpoint: 'http://child.test', token: 'account-a' },
  repository: { session: vi.fn(), submitMessage: vi.fn() },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => mocks.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: mocks.settings }),
}));
const child = {
  id: 'child',
  parent_session_id: 'parent',
  workspace_id: 'ws',
  archived: false,
  mode: 'plan',
  approval_mode: 'ask',
  effort: 'low',
};
const view = () => (
  <ChildConversationFollowup sessionId="child" parentSessionId="parent" workspaceId="ws" />
);
function type(text = 'Explain the evidence') {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
}
function send() {
  fireEvent.submit(screen.getByRole('textbox').closest('form')!);
}

beforeEach(() => {
  sessionStorage.clear();
  mocks.settings = { endpoint: 'http://child.test', token: 'account-a' };
  mocks.repository.session.mockReset().mockResolvedValue(child);
  mocks.repository.submitMessage.mockReset().mockResolvedValue({ state: 'pending_steer' });
});
afterEach(cleanup);

describe('existing child follow-ups', () => {
  it('preserves behavior and uses the child model with automatic delivery', async () => {
    render(view());
    type();
    send();
    await screen.findByText('Follow-up will join the running conversation');
    expect(mocks.repository.session).toHaveBeenCalledWith('child', 'ws', expect.any(AbortSignal));
    const [id, input] = mocks.repository.submitMessage.mock.calls[0]!;
    expect(id).toBe('child');
    expect(input).toMatchObject({
      delivery: 'auto',
      behavior: {
        execution_mode: 'plan',
        confirmation_policy: 'ask',
        reasoning_effort: 'low',
      },
      parts: [{ type: 'text', text: 'Explain the evidence' }],
    });
    expect(input).not.toHaveProperty('model');
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('reuses an uncertain request after closing the panel even if defaults changed', async () => {
    mocks.repository.submitMessage.mockRejectedValueOnce(new Error('Response lost'));
    const first = render(view());
    type('Retry this finding');
    send();
    await screen.findByText('Response lost');
    const original = mocks.repository.submitMessage.mock.calls[0]![1];
    first.unmount();
    mocks.repository.session.mockResolvedValue({ ...child, mode: 'edit', approval_mode: 'bypass' });
    render(view());
    expect(screen.getByRole('textbox')).toHaveValue('Retry this finding');
    send();
    await screen.findByText('Follow-up will join the running conversation');
    expect(mocks.repository.submitMessage.mock.calls[1]![1]).toEqual(original);
  });

  it('refuses another parent and unknown behavior', async () => {
    mocks.repository.session.mockResolvedValueOnce({ ...child, parent_session_id: 'other' });
    render(view());
    type('Check ownership');
    send();
    await screen.findByRole('alert');
    expect(mocks.repository.submitMessage).not.toHaveBeenCalled();
    mocks.repository.session.mockResolvedValue({ ...child, mode: 'unknown' });
    send();
    await screen.findByText(/uses behavior settings this version cannot send/);
    expect(mocks.repository.submitMessage).not.toHaveBeenCalled();
  });

  it('isolates drafts and cancels a pending lookup when credentials change', async () => {
    let resolve!: (value: typeof child) => void;
    mocks.repository.session.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const rendered = render(view());
    type('Private review');
    send();
    const signal = mocks.repository.session.mock.calls[0]![2] as AbortSignal;
    mocks.settings = { ...mocks.settings, token: 'account-b' };
    rendered.rerender(view());
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(signal.aborted).toBe(true);
    resolve(child);
    await waitFor(() => expect(mocks.repository.submitMessage).not.toHaveBeenCalled());
    mocks.settings = { ...mocks.settings, token: 'account-a' };
    rendered.rerender(view());
    expect(screen.getByRole('textbox')).toHaveValue('Private review');
  });

  it('accepts Enter, leaves Shift+Enter for new lines, and prevents duplicate sends', async () => {
    mocks.repository.submitMessage.mockReturnValue(new Promise(() => {}));
    render(view());
    type('Keyboard review');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true });
    expect(mocks.repository.session).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    send();
    await waitFor(() => expect(mocks.repository.submitMessage).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
