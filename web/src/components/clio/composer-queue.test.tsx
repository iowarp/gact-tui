import type { QueuedMessage } from '@clio/core/v3';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioComposerQueue } from './composer-queue';

afterEach(cleanup);

const queued = (id: string, text: string, position: number): QueuedMessage => ({
  id,
  session_id: 'session_1',
  revision: 1,
  position,
  parts: [{ type: 'text', text }],
  metadata: {},
  client_message_id: id,
  idempotency_key: id,
  behavior: {
    reasoning_effort: 'medium',
    execution_mode: 'execute',
    confirmation_policy: 'ask',
  },
  model: { provider_id: 'codex', model_id: 'gpt-5.6-luna' },
  created_at: '2026-08-31T12:00:00Z',
  updated_at: '2026-08-31T12:00:00Z',
});

function renderQueue(overrides: Partial<Parameters<typeof ClioComposerQueue>[0]> = {}) {
  const props = {
    messages: [queued('queue_1', 'First message', 0), queued('queue_2', 'Second message', 1)],
    promoteDelivery: 'steer' as const,
    onDelete: vi.fn().mockResolvedValue(undefined),
    onPromote: vi.fn().mockResolvedValue(undefined),
    onReorder: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<ClioComposerQueue {...props} />);
  return props;
}

describe('ClioComposerQueue', () => {
  it('keeps compact icon actions and supports keyboard reordering from the left handle', async () => {
    const user = userEvent.setup();
    const props = renderQueue();

    expect(screen.getByLabelText('Queued messages')).toHaveClass(
      '-mb-px',
      'w-[calc(100%_-_1.5rem)]',
      'max-w-[54.5rem]',
      'rounded-b-none',
      'border-b-0',
    );
    const handles = screen.getAllByRole('button', { name: 'Reorder queued message' });
    const firstRowButtons = within(handles[0].closest('li')!).getAllByRole('button');
    expect(firstRowButtons[0]).toBe(handles[0]);
    await user.click(handles[1]);
    await user.keyboard('{ArrowUp}');
    expect(props.onReorder).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'queue_2' }),
      expect.objectContaining({ id: 'queue_1' }),
    ]);
    expect(screen.getAllByRole('button', { name: 'Edit queued message' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete queued message' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Send queued message now' })).toHaveLength(2);
  });

  it('shows a visible name when an icon action is hovered', async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.hover(screen.getAllByRole('button', { name: 'Send queued message now' })[0]);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Send queued message now');
  });

  it('preserves a local edit when the service rejects a stale revision', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockRejectedValue(new Error('revision conflict'));
    renderQueue({ onUpdate });

    await user.click(screen.getAllByRole('button', { name: 'Edit queued message' })[0]);
    const input = screen.getByRole('textbox', { name: 'Edit queued message' });
    await user.clear(input);
    await user.type(input, 'Locally revised message');
    await user.click(screen.getByRole('button', { name: 'Save queued message' }));

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'queue_1', revision: 1 }),
      'Locally revised message',
    );
    expect(screen.getByDisplayValue('Locally revised message')).toBeVisible();
  });

  it('promotes with the selected immediate delivery intent', async () => {
    const user = userEvent.setup();
    const props = renderQueue();
    await user.click(screen.getAllByRole('button', { name: 'Send queued message now' })[0]);
    expect(props.onPromote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'queue_1' }),
      'steer',
    );
  });
});
