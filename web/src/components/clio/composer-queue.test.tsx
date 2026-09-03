import type { QueuedMessage, WorkspaceResource } from '@clio/core/v3';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPOSER_QUEUE_ROW_HEIGHT_PX,
  COMPOSER_QUEUE_VIEWPORT_MAX_HEIGHT_PX,
} from '@/lib/runtime-limits';
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

function workspaceResource(
  id: string,
  name: string,
  processingState: NonNullable<WorkspaceResource['processing']>['state'],
): WorkspaceResource {
  return {
    id,
    workspace_id: 'ws_1',
    client_upload_id: `upload_${id}`,
    revision: 1,
    name,
    claimed_mime: name.endsWith('.png') ? 'image/png' : 'application/pdf',
    detected_mime: name.endsWith('.png') ? 'image/png' : 'application/pdf',
    detection_source: 'signature',
    declared_size: 42,
    received_size: 42,
    sha256: id,
    state: 'ready',
    failure: '',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    completed_at: '2026-09-01T00:00:00Z',
    mime_mismatch: false,
    processing: {
      workspace_id: 'ws_1',
      resource_id: id,
      resource_revision: 1,
      source_sha256: id,
      processor: 'clio-web-search-docling',
      processor_url: 'http://127.0.0.1:8089',
      job_id: `job_${id}`,
      query_tool: 'workspace_resource_inspect',
      state: processingState,
      progress: processingState === 'processing' ? 42 : 100,
      derivatives_available: processingState === 'complete',
      failure: {},
      cancellation: {},
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
  };
}

function renderQueue(overrides: Partial<Parameters<typeof ClioComposerQueue>[0]> = {}) {
  const props = {
    messages: [queued('queue_1', 'First message', 0), queued('queue_2', 'Second message', 1)],
    promoteDelivery: 'steer' as const,
    onDelete: vi.fn().mockResolvedValue(undefined),
    onOpenResource: vi.fn(),
    onPromote: vi.fn().mockResolvedValue(undefined),
    onReorder: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<ClioComposerQueue {...props} />);
  return props;
}

describe('ClioComposerQueue', () => {
  it('keeps compact icon actions inside the ReUI sortable contract', () => {
    renderQueue();

    const queue = screen.getByLabelText('Queued messages');
    expect(screen.getByText('2 queued messages')).toHaveAttribute('aria-live', 'polite');
    expect(queue.querySelectorAll('[data-queue-live-item]')).toHaveLength(2);
    const handles = screen.getAllByRole('button', { name: 'Reorder queued message' });
    const firstRowButtons = within(handles[0].closest('li')!).getAllByRole('button');
    expect(firstRowButtons[0]).toBe(handles[0]);
    expect(queue.querySelector('[data-slot="sortable"]')).toBeInTheDocument();
    expect(queue.querySelectorAll('[data-slot="sortable-item"]')).toHaveLength(2);
    expect(queue.querySelectorAll('[data-slot="sortable-item-handle"]')).toHaveLength(2);
    expect(queue.querySelector('[draggable="true"]')).not.toBeInTheDocument();
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

  it('names and focuses the queue viewport at every queue length', () => {
    renderQueue({ messages: [queued('queue_1', 'Only message', 0)] });

    const viewport = screen.getByRole('region', { name: '1 queued messages' });
    expect(viewport).toHaveAttribute('tabindex', '0');
  });

  it('clamps the queue viewport to its own row budget instead of the conversation area', () => {
    renderQueue({
      messages: Array.from({ length: 6 }, (_, index) =>
        queued(`queue_${index}`, `Queued message ${index + 1}`, index),
      ),
    });

    // Without an intrinsic bound the scroll chain is capped only by the
    // composer stack, so a six-row queue never overflows on a roomy viewport
    // and the queue can never be scrolled.
    const viewport = screen.getByRole('region', { name: '6 queued messages' });
    expect(viewport.style.maxHeight).toBe(`${COMPOSER_QUEUE_VIEWPORT_MAX_HEIGHT_PX}px`);
    expect(COMPOSER_QUEUE_VIEWPORT_MAX_HEIGHT_PX).toBeLessThan(6 * COMPOSER_QUEUE_ROW_HEIGHT_PX);
    expect(viewport).toHaveClass('overscroll-contain');
    expect(viewport).toHaveAttribute('tabindex', '0');
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

  it('keeps structured context references visible while a message is queued', () => {
    const message = queued('queue_references', '', 0);
    message.parts.push(
      {
        type: 'context_ref',
        ref_kind: 'artifact',
        ref_id: 'artifact_plot',
        label: 'Displacement plot',
        revision: 'v3',
      },
      {
        type: 'context_ref',
        ref_kind: 'session',
        ref_id: 'session_prior',
        label: 'Prior evidence review',
        revision: '2026-09-02T12:00:00Z',
      },
    );

    renderQueue({ messages: [message] });

    expect(screen.getByText('Context only')).toBeVisible();
    expect(screen.getByTitle('artifact · Displacement plot')).toBeVisible();
    expect(screen.getByTitle('session · Prior evidence review')).toBeVisible();
  });

  it('shows compact queued attachment progress, hover semantics, preview, and overflow', async () => {
    const user = userEvent.setup();
    const message = queued('queue_resources', 'Review these files', 0);
    message.parts.push(
      {
        type: 'resource_ref',
        resource_id: 'res_panel',
        resource_revision: '1',
        name: 'panel-b.png',
      },
      {
        type: 'resource_ref',
        resource_id: 'res_paper',
        resource_revision: '1',
        name: 'paper.pdf',
      },
      {
        type: 'resource_ref',
        resource_id: 'res_notes',
        resource_revision: '1',
        name: 'notes.pdf',
      },
    );
    const panel = workspaceResource('res_panel', 'panel-b.png', 'processing');
    const props = renderQueue({
      messages: [message],
      resources: [
        panel,
        workspaceResource('res_paper', 'paper.pdf', 'complete'),
        workspaceResource('res_notes', 'notes.pdf', 'complete'),
      ],
    });

    const attachment = screen.getByRole('button', { name: 'Open panel-b.png' });
    expect(
      within(attachment).getByRole('img', { name: 'Attachment status: Processing' }),
    ).toBeVisible();
    expect(screen.getByLabelText('1 more attachments')).toHaveTextContent('+1');

    await user.hover(attachment);
    expect(await screen.findByRole('status', { name: 'Upload status: Complete' })).toBeVisible();
    expect(screen.getByText(/structured content is in progress/i)).toBeVisible();
    const conversionStatus = screen.getByRole('status', {
      name: 'Conversion status: In progress',
    });
    expect(conversionStatus).toHaveTextContent('In progress');
    expect(conversionStatus).not.toHaveTextContent('42%');

    await user.click(attachment);
    expect(props.onOpenResource).toHaveBeenCalledWith(panel);
  });
});
