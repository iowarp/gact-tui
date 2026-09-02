import type { QueuedMessage } from '@clio/core/v3';
import { QueuedMessageReorderConflictError } from '@clio/core/v3';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { ClioComposerQueue } from './composer-queue';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

/**
 * The pointer drag itself belongs to the vendored ReUI/dnd-kit sortable and is
 * covered by the browser suite. This file stands in for it so the commit path
 * that CLIO owns - what the surface does with an accepted, a conflicted, and a
 * failed reorder - is exercised without a real pointer.
 */
vi.mock('@/components/reui/sortable', () => ({
  Sortable: ({
    children,
    onValueChange,
    onValueCommit,
    value,
  }: {
    children: ReactNode;
    onValueChange: (next: QueuedMessage[]) => void;
    onValueCommit: (next: QueuedMessage[]) => void;
    value: QueuedMessage[];
  }) => (
    <div data-slot="sortable">
      <button
        onClick={() => {
          const next = [...value].reverse();
          onValueChange(next);
          onValueCommit(next);
        }}
        type="button"
      >
        Drag the last message to the top
      </button>
      {children}
    </div>
  ),
  SortableItem: ({ children }: { children: ReactNode }) => children,
  SortableItemHandle: ({ children }: { children: ReactNode }) => children,
}));

afterEach(cleanup);
beforeEach(() => vi.mocked(toast.error).mockClear());

const queued = (id: string, text: string, position: number): QueuedMessage => ({
  id,
  session_id: 'session_1',
  revision: 1,
  position,
  parts: [{ type: 'text', text }],
  metadata: {},
  client_message_id: id,
  idempotency_key: id,
  behavior: { reasoning_effort: 'medium', execution_mode: 'execute', confirmation_policy: 'ask' },
  model: { provider_id: 'codex', model_id: 'gpt-5.6-luna' },
  created_at: '2026-08-31T12:00:00Z',
  updated_at: '2026-08-31T12:00:00Z',
});

const first = queued('queue_1', 'First message', 0);
const second = queued('queue_2', 'Second message', 1);
const serverOnly = queued('queue_server', 'Queued by another window', 0);

function renderQueue(overrides: Partial<Parameters<typeof ClioComposerQueue>[0]> = {}) {
  const props = {
    messages: [first, second],
    promoteDelivery: 'steer' as const,
    onDelete: vi.fn().mockResolvedValue(undefined),
    onPromote: vi.fn().mockResolvedValue(undefined),
    onReorder: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const { rerender } = render(<ClioComposerQueue {...props} />);
  return {
    props,
    rerender: (next: Partial<Parameters<typeof ClioComposerQueue>[0]> = {}) =>
      rerender(<ClioComposerQueue {...props} {...next} />),
  };
}

function renderedOrder(): string[] {
  return [...document.querySelectorAll('[data-queue-live-item]')].map(
    (row) => row.textContent?.trim() ?? '',
  );
}

describe('ClioComposerQueue reorder commit', () => {
  it('holds the dragged order in flight and then follows the service list', async () => {
    const user = userEvent.setup();
    let accept = () => undefined as void;
    const onReorder = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );
    const { rerender } = renderQueue({ onReorder });

    await user.click(screen.getByRole('button', { name: 'Drag the last message to the top' }));

    expect(onReorder).toHaveBeenCalledWith([second, first]);
    // The drag stays visible while the service decides; it is never snapped back.
    expect(renderedOrder()[0]).toContain('Second message');

    accept();
    rerender({ messages: [second, first] });
    await waitFor(() => expect(renderedOrder()[0]).toContain('Second message'));
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it('shows the service order and says so when the queue changed underneath', async () => {
    const user = userEvent.setup();
    const onReorder = vi
      .fn()
      .mockRejectedValue(
        new QueuedMessageReorderConflictError(
          [serverOnly, first, second],
          'queued message revision conflict',
        ),
      );
    const { rerender } = renderQueue({ onReorder });

    await user.click(screen.getByRole('button', { name: 'Drag the last message to the top' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        'Queued messages changed on the service',
        expect.objectContaining({
          description: expect.stringContaining('latest order'),
        }),
      ),
    );
    // The drag is dropped rather than replayed, and the surface falls back to
    // whatever the service list says.
    rerender({ messages: [serverOnly, first, second] });
    expect(renderedOrder()).toEqual([
      'Queued by another window',
      'First message',
      'Second message',
    ]);
  });

  it('reports an ordinary reorder failure as a failure', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn().mockRejectedValue(new Error('connection interrupted'));
    renderQueue({ onReorder });

    await user.click(screen.getByRole('button', { name: 'Drag the last message to the top' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Unable to reorder queued messages', {
        description: 'connection interrupted',
      }),
    );
    expect(renderedOrder()[0]).toContain('First message');
  });
});
