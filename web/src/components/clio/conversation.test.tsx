import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ClioConversation } from './conversation';

// Scroll, virtualization, and minimap behaviour live in
// `conversation-viewport.test.tsx`; this file covers message content.
const virtualizerMocks = vi.hoisted(() => ({ scrollToIndex: vi.fn() }));

vi.mock('@tanstack/react-virtual', () => ({
  defaultRangeExtractor: () => [],
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 180,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        end: (index + 1) * 180,
        index,
        key: index,
        size: 180,
        start: index * 180,
      })),
    measureElement: () => undefined,
    measure: () => undefined,
    scrollToIndex: virtualizerMocks.scrollToIndex,
  }),
}));

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  virtualizerMocks.scrollToIndex.mockClear();
  window.history.replaceState(null, '', window.location.pathname);
});

function renderConversation(element: ReactElement) {
  return render(
    <AppearanceProvider>
      <ConversationDisplayProvider>{element}</ConversationDisplayProvider>
    </AppearanceProvider>,
  );
}


describe('ClioConversation recovery actions', () => {
  it('keeps a structured context reference visible and clickable in the sent message', async () => {
    const user = userEvent.setup();
    const onOpenReference = vi.fn();
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_reference',
            session_id: 'session_1',
            role: 'user',
            created_at: '2026-09-02T00:00:00Z',
            blocks: [
              {
                id: 'reference_part',
                type: 'context_reference',
                ref_kind: 'workspace_file',
                ref_id: 'README.md',
                label: 'README.md',
                revision: 'sha256:abc',
                media_type: 'text/markdown',
                navigation: { workspace_id: 'workspace_1', path: 'README.md' },
              },
              { id: 'text_part', type: 'text', text: 'Use this as context.' },
            ],
          },
        ]}
        onOpenReference={onOpenReference}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    const reference = screen.getByRole('button', { name: 'Open referenced local file README.md' });
    // The kind is named the way a reader would name it, and the addressing
    // revision is not shown as prose anywhere on the card.
    expect(reference).toHaveAttribute('title', 'local file');
    expect(reference).toHaveAttribute('data-reference-revision', 'sha256:abc');
    expect(reference).not.toHaveTextContent('sha256:abc');
    expect(reference).not.toHaveTextContent('·');
    expect(reference.querySelector('svg')).toHaveClass('lucide-file-text');

    await user.click(reference);
    expect(onOpenReference).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'workspace_file',
        id: 'README.md',
        detail: '',
        navigation: { workspace_id: 'workspace_1', path: 'README.md' },
      }),
    );
    expect(screen.getByText('Use this as context.')).toBeInTheDocument();
  });

  it('presents user attachments above the prompt without exposing private prompt context', async () => {
    const user = userEvent.setup();
    const onOpenResource = vi.fn();
    const resource = {
      id: 'res_1',
      workspace_id: 'workspace_1',
      client_upload_id: 'upload_1',
      revision: 1,
      name: 'paper.pdf',
      claimed_mime: 'application/pdf',
      detected_mime: 'application/pdf',
      detection_source: 'signature',
      declared_size: 42,
      received_size: 42,
      sha256: 'abc',
      state: 'ready' as const,
      failure: '',
      created_at: '2026-08-22T00:00:00Z',
      updated_at: '2026-08-22T00:00:00Z',
      completed_at: '2026-08-22T00:00:00Z',
      mime_mismatch: false,
      processing: {
        workspace_id: 'workspace_1',
        resource_id: 'res_1',
        resource_revision: 1,
        source_sha256: 'abc',
        processor: 'clio-web-search-docling',
        processor_url: 'http://processor.test',
        job_id: 'job_1',
        query_tool: 'workspace_resource_inspect',
        state: 'cancelled' as const,
        progress: 100,
        derivatives_available: true,
        failure: {},
        cancellation: {},
        created_at: '2026-08-22T00:00:00Z',
        updated_at: '2026-08-22T00:00:00Z',
      },
    };

    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_resource',
            session_id: 'session_1',
            role: 'user',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [
              { id: 'text_part', type: 'text', text: 'Analyze this filing.' },
              {
                id: 'resource_part',
                type: 'resource',
                resource_id: 'res_1',
                resource_revision: '1',
                workspace_id: 'workspace_1',
                name: 'paper.pdf',
                media_type: 'application/pdf',
              },
            ],
          },
        ]}
        onOpenResource={onOpenResource}
        resources={{ res_1: resource }}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    const attachment = screen.getByRole('button', { name: 'Open paper.pdf' });
    expect(attachment).toHaveTextContent('paper.pdf');
    expect(attachment).not.toHaveTextContent('Converted');
    const status = screen.getByRole('img', { name: 'Attachment status: Ready' });
    expect(status).toBeInTheDocument();
    await user.hover(status);
    expect(
      await screen.findByText(
        /reuse a previously converted derivative.*latest refresh was cancelled/i,
      ),
    ).toBeVisible();
    expect(screen.getByText('Analyze this filing.')).toBeInTheDocument();
    const textBubble = screen
      .getByText('Analyze this filing.')
      .closest<HTMLElement>('[data-slot="message-text"]');
    expect(textBubble).toHaveClass(
      'group-[.is-user]:rounded-lg',
      'group-[.is-user]:bg-secondary',
      'group-[.is-user]:px-4',
      'group-[.is-user]:py-3',
    );
    expect(textBubble?.parentElement).not.toHaveClass('bg-secondary', 'px-4', 'py-3');
    const attachmentTray = attachment.closest<HTMLElement>('[data-slot="scroll-area"]');
    expect(attachmentTray).not.toContainElement(textBubble);
    expect(textBubble?.parentElement?.firstElementChild).toBe(attachmentTray);
    expect(screen.queryByText(/private runtime context/i)).not.toBeInTheDocument();
    fireEvent.click(attachment);
    expect(onOpenResource).toHaveBeenCalledWith(resource, [resource]);
  });

  it('renders a resource block carried by an assistant turn that already has iterations', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_assistant_resource',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [
              { id: 'reason_resource', type: 'reasoning', text: 'Registering the export.' },
              { id: 'tool_resource', type: 'tool', tool_id: 'tool_write' },
              {
                id: 'resource_assistant',
                type: 'resource',
                resource_id: 'res_out',
                resource_revision: '1',
                workspace_id: 'workspace_1',
                name: 'summary.csv',
                media_type: 'text/csv',
              },
            ],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{
          tool_write: {
            id: 'tool_write',
            session_id: 'session_1',
            name: 'workspace_resource_write',
            title: 'Write the summary',
            state: 'succeeded',
          },
        }}
      />,
    );

    expect(screen.getByText('summary.csv')).toBeInTheDocument();
  });

  it('groups user resources into one leading tray while preserving prompt text order', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_ordered',
            session_id: 'session_1',
            role: 'user',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [
              { id: 'text_before', type: 'text', text: 'Before the attachments.' },
              {
                id: 'resource_one',
                type: 'resource',
                resource_id: 'res_one',
                resource_revision: '1',
                workspace_id: 'workspace_1',
                name: 'first.csv',
                media_type: 'text/csv',
              },
              {
                id: 'resource_two',
                type: 'resource',
                resource_id: 'res_two',
                resource_revision: '1',
                workspace_id: 'workspace_1',
                name: 'second.csv',
                media_type: 'text/csv',
              },
              { id: 'text_after', type: 'text', text: 'After the attachments.' },
            ],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    const grids = screen.getAllByRole('group', { name: /message attachment/i });
    expect(grids).toHaveLength(1);
    expect(grids[0]).toHaveTextContent('first.csv');
    expect(grids[0]).toHaveTextContent('second.csv');

    const before = screen.getByText('Before the attachments.');
    const after = screen.getByText('After the attachments.');
    expect(grids[0]!.compareDocumentPosition(before)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before.compareDocumentPosition(after)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders an accepted steer as the real human message and permits cancellation before claim', () => {
    const onCancelPendingSteer = vi.fn();

    renderConversation(
      <ClioConversation
        artifacts={{}}
        cancellablePendingMessageIds={new Set(['message_pending'])}
        messages={[
          {
            id: 'message_pending',
            session_id: 'session_1',
            role: 'user',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [{ id: 'text_pending', type: 'text', text: 'Use the newer evidence.' }],
          },
        ]}
        onCancelPendingSteer={onCancelPendingSteer}
        pendingMessageIds={new Set(['message_pending'])}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    const message = screen.getByText('Use the newer evidence.').closest('.border-dashed');
    expect(message).toHaveClass('border-dashed');
    expect(screen.queryByText(/steering|safe boundary/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel pending message' }));
    expect(onCancelPendingSteer).toHaveBeenCalledWith('message_pending');
  });

  it('keeps a claimed steer visually pending without offering an invalid cancellation', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        cancellablePendingMessageIds={new Set()}
        messages={[
          {
            id: 'message_claimed',
            session_id: 'session_1',
            role: 'user',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [{ id: 'text_claimed', type: 'text', text: 'Inspect the alternate station.' }],
          },
        ]}
        pendingMessageIds={new Set(['message_claimed'])}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(
      screen.getByText('Inspect the alternate station.').closest('.border-dashed'),
    ).toHaveClass('border-dashed');
    expect(
      screen.queryByRole('button', { name: 'Cancel pending message' }),
    ).not.toBeInTheDocument();
  });

  it('does not claim an authoritative transcript is empty while it is loading', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        loading
        messages={[]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.getByText('Loading conversation')).toBeVisible();
    expect(screen.queryByText('This session has no messages')).not.toBeInTheDocument();
  });

  it('reports a transcript failure instead of presenting a false empty session', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        error="The agent could not return this transcript."
        messages={[]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.getByText('Conversation unavailable')).toBeVisible();
    expect(screen.getByText('The agent could not return this transcript.')).toBeVisible();
    expect(screen.queryByText('This session has no messages')).not.toBeInTheDocument();
  });

  it('uses the shared message action for recoverable assistant responses', () => {
    const onRetryMessage = vi.fn();

    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_1',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [
              {
                id: 'error_1',
                type: 'error',
                code: 'provider_unavailable',
                message: 'The response was interrupted.',
                recoverable: true,
              },
            ],
          },
        ]}
        onRetryMessage={onRetryMessage}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry response' }));

    expect(onRetryMessage).toHaveBeenCalledWith('message_1');
  });

  it('does not imply retry support for non-recoverable failures', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_2',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [
              {
                id: 'error_2',
                type: 'error',
                code: 'invalid_request',
                message: 'The request cannot be retried.',
                recoverable: false,
              },
            ],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Retry response' })).not.toBeInTheDocument();
  });

  it('makes an assistant turn with no recorded content explicitly recoverable', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_3',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [],
          },
        ]}
        onRetryMessage={() => undefined}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.getByText('Response unavailable')).toBeInTheDocument();
    expect(screen.getByText(/No response content was recorded/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry response' })).toBeEnabled();
  });

  it('explains when a response was interrupted by a service restart', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_restart_interrupted',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-09-11T18:30:23Z',
            blocks: [],
            stop_reason: 'error',
            error_info: {
              error: 'server_restart_interrupted',
              message:
                'The agent service restarted before this response completed. Your request was preserved and can be retried.',
              recoverable: true,
            },
          },
        ]}
        onRetryMessage={() => undefined}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.getByText('Response interrupted')).toBeInTheDocument();
    expect(screen.getByText(/agent service restarted/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry response' })).toBeEnabled();
  });

  it('does not render projection-only A2UI updates as missing assistant responses', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'msg_a2ui_action_update',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.queryByText('Response unavailable')).not.toBeInTheDocument();
    expect(screen.getByText('This session has no messages')).toBeInTheDocument();
  });
});
