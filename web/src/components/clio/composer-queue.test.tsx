import type { QueuedMessage, WorkspaceResource } from '@clio/core/v3';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPOSER_QUEUE_ROW_HEIGHT_PX,
  COMPOSER_QUEUE_VIEWPORT_MAX_HEIGHT_PX,
} from '@/lib/runtime-limits';
import { TooltipProvider } from '@/components/ui/tooltip';
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
  render(
    <TooltipProvider>
      <ClioComposerQueue {...props} />
    </TooltipProvider>,
  );
  return props;
}

describe('ClioComposerQueue', () => {
  it('says Paused in words while keeping Steer now available', async () => {
    const user = userEvent.setup();
    const props = renderQueue({ paused: true });

    const live = screen.getByText('Paused').closest('[aria-live]');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('2 queued messages')).toBeVisible();
    expect(props.onPromote).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole('button', { name: 'Steer now' })[0]);
    expect(props.onPromote).toHaveBeenCalledOnce();
    expect(props.onPromote).toHaveBeenCalledWith(props.messages[0], 'steer');
  });

  it('draws one sortable line per message with the handle first and named icon actions', () => {
    renderQueue();

    const queue = screen.getByRole('region', { name: 'Queued messages' });
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();
    expect(queue.querySelectorAll('[data-queue-live-item]')).toHaveLength(2);
    const handles = screen.getAllByRole('button', { name: 'Reorder queued message' });
    const firstRow = handles[0].closest('li')!;
    expect(firstRow).toHaveAttribute('role', 'listitem');
    expect(within(firstRow).getAllByRole('button')[0]).toBe(handles[0]);
    expect(within(firstRow).getByText('First message')).toHaveAttribute('title', 'First message');
    expect(queue.querySelector('[data-slot="sortable"]')).toBeInTheDocument();
    expect(queue.querySelectorAll('[data-slot="sortable-item"]')).toHaveLength(2);
    expect(queue.querySelectorAll('[data-slot="sortable-item-handle"]')).toHaveLength(2);
    expect(queue.querySelector('[draggable="true"]')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Steer now' })).toHaveLength(2);
    // One strip, not a card per message.
    expect(queue.querySelectorAll('[data-queue-live-item].border')).toHaveLength(0);
    expect(queue).not.toHaveClass('backdrop-blur-xl');
  });

  it('names the main verb Send now when nothing is running', async () => {
    const user = userEvent.setup();
    const props = renderQueue({ promoteDelivery: 'start' });

    expect(screen.queryByRole('button', { name: 'Steer now' })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Send now' })[1]);
    expect(props.onPromote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'queue_2' }),
      'start',
    );
  });

  it('shows a visible name when an icon action is hovered', async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.hover(screen.getAllByRole('button', { name: 'Steer now' })[0]);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Steer now');
  });

  it('deletes the row the action belongs to', async () => {
    const user = userEvent.setup();
    const props = renderQueue();

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[1]);

    expect(props.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'queue_2' }));
  });

  it('disables every row action while the queue is busy', () => {
    renderQueue({ busy: true });

    for (const name of ['Edit', 'Delete', 'Steer now']) {
      for (const button of screen.getAllByRole('button', { name })) expect(button).toBeDisabled();
    }
  });

  it('names and focuses the queue viewport at every queue length', () => {
    renderQueue({ messages: [queued('queue_1', 'Only message', 0)] });

    const viewport = screen.getByRole('region', { name: '1 queued message' });
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('1 queued message')).toBeVisible();
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

  it('folds a queue longer than three messages from its header', async () => {
    const user = userEvent.setup();
    renderQueue({
      messages: Array.from({ length: 4 }, (_, index) =>
        queued(`queue_${index}`, `Queued message ${index + 1}`, index),
      ),
    });

    const hide = screen.getByRole('button', { name: 'Hide queued messages' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    await user.click(hide);
    expect(screen.queryByRole('region', { name: '4 queued messages' })).not.toBeInTheDocument();
    expect(screen.getByText('4 queued messages')).toBeVisible();
    const show = screen.getByRole('button', { name: 'Show queued messages' });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    await user.click(show);
    expect(screen.getByRole('region', { name: '4 queued messages' })).toBeVisible();
  });

  it('keeps a short queue open without a fold control', () => {
    renderQueue();
    expect(screen.queryByRole('button', { name: /queued messages$/ })).not.toBeInTheDocument();
  });

  it('picks a row up from the keyboard on its drag handle', async () => {
    // The arrow-key move itself is dnd-kit geometry, exercised in the browser
    // suite; this pins the wiring: the handle is the keyboard activator and
    // the row announces itself as sortable.
    const user = userEvent.setup();
    const props = renderQueue();

    const row = screen.getAllByRole('listitem')[0];
    expect(row).toHaveAttribute('aria-roledescription', 'sortable');
    expect(row).toHaveAttribute('aria-describedby');
    const handle = within(row).getByRole('button', { name: 'Reorder queued message' });
    act(() => handle.focus());
    await user.keyboard(' ');
    expect(row).toHaveAttribute('data-dragging', 'true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(row).toHaveAttribute('data-dragging', 'false'));
    expect(props.onReorder).not.toHaveBeenCalled();
  });

  it('preserves a local edit when the service rejects a stale revision', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockRejectedValue(new Error('revision conflict'));
    renderQueue({ onUpdate });

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const input = screen.getByRole('textbox', { name: 'Edit queued message' });
    await user.clear(input);
    await user.type(input, 'Locally revised message');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'queue_1', revision: 1 }),
      'Locally revised message',
    );
    expect(screen.getByDisplayValue('Locally revised message')).toBeVisible();
  });

  it('edits in place: Enter saves, Escape cancels and returns focus to Edit', async () => {
    const user = userEvent.setup();
    const props = renderQueue();

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    const input = screen.getByRole('textbox', { name: 'Edit queued message' });
    expect(input).toHaveFocus();
    expect(input).toHaveValue('Second message');
    expect(screen.queryAllByRole('button', { name: 'Steer now' })).toHaveLength(1);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Edit queued message' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' })[1]).toHaveFocus();
    expect(props.onUpdate).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await user.keyboard(' revised{Enter}');
    expect(props.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'queue_1' }),
      'First message revised',
    );
    expect(screen.queryByRole('textbox', { name: 'Edit queued message' })).not.toBeInTheDocument();
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
    // The kind is carried by the icon and named in plain words, never as a
    // glyph-separated field list.
    const artifact = screen.getByTitle('Displacement plot (artifact)');
    expect(artifact).toBeVisible();
    expect(artifact.querySelector('svg')).toHaveClass('lucide-package');
    // The rest fold into a count that still names what it stands for.
    const overflow = screen.getByTitle('Prior evidence review (conversation)');
    expect(overflow).toHaveTextContent('+1 more reference');
    // Secondary, but at the muted token rather than faint: it is text.
    expect(overflow.closest('.text-muted-foreground')).not.toBeNull();
    expect(screen.queryByText('Â·')).not.toBeInTheDocument();
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
    const overflow = screen.getByTitle('paper.pdf, notes.pdf');
    expect(overflow).toHaveTextContent('+2 more attachments');

    await user.hover(attachment);
    expect(await screen.findByRole('status', { name: 'Upload status: Complete' })).toBeVisible();
    expect(
      screen.getByText(/^In progress\. The original is retained and can be previewed\.$/i),
    ).toBeVisible();
    const conversionStatus = screen.getByRole('status', {
      name: 'Conversion status: In progress',
    });
    expect(conversionStatus).toHaveTextContent('In progress');
    expect(conversionStatus).not.toHaveTextContent('42%');

    await user.click(attachment);
    expect(props.onOpenResource).toHaveBeenCalledWith(panel);
  });

  it('says in words when a message could not be sent and shows why on request', async () => {
    const user = userEvent.setup();
    const message = queued('queue_failed', 'Retry the regrid', 0);
    message.promotion_error = {
      status_code: 409,
      detail: 'The run ended before this message was delivered.',
    };

    renderQueue({ messages: [message] });

    const problem = screen.getByRole('button', { name: 'Needs attention' });
    expect(problem).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/run ended before/)).not.toBeInTheDocument();
    await user.click(problem);
    expect(problem).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('The run ended before this message was delivered.')).toBeVisible();
  });
});
