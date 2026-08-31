import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ClioConversation } from './conversation';

const virtualizerMocks = vi.hoisted(() => ({ scrollToIndex: vi.fn() }));

vi.mock('@tanstack/react-virtual', () => ({
  defaultRangeExtractor: () => [],
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 180,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        size: 180,
        start: index * 180,
      })),
    measureElement: () => undefined,
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
  it('renders workspace resources above human prose without exposing private prompt context', () => {
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
        state: 'complete' as const,
        progress: 100,
        failure: {},
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
              {
                id: 'resource_part',
                type: 'resource',
                resource_id: 'res_1',
                resource_revision: '1',
                workspace_id: 'workspace_1',
                name: 'paper.pdf',
                media_type: 'application/pdf',
              },
              { id: 'text_part', type: 'text', text: 'Analyze this filing.' },
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
    expect(attachment).toHaveTextContent('Converted');
    expect(screen.getByText('Analyze this filing.')).toBeInTheDocument();
    expect(screen.queryByText(/private runtime context/i)).not.toBeInTheDocument();
    fireEvent.click(attachment);
    expect(onOpenResource).toHaveBeenCalledWith(resource);
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

    const message = screen.getByText('Use the newer evidence.').parentElement;
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

    expect(screen.getByText('Inspect the alternate station.').parentElement).toHaveClass(
      'border-dashed',
    );
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

  it('focuses an authoritative memory-search result by message id', async () => {
    window.history.replaceState(null, '', '#message-message_2');
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_1',
            session_id: 'session_1',
            role: 'user',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [],
          },
          {
            id: 'message_2',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-22T00:01:00Z',
            blocks: [],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    await waitFor(() =>
      expect(virtualizerMocks.scrollToIndex).toHaveBeenCalledWith(1, { align: 'center' }),
    );
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'message-message_2'));
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

  it('renders navigable child-agent semantics from the shared dispatch component', () => {
    const onOpenSubagent = vi.fn();
    const child = {
      id: 'task_geo',
      session_id: 'session_1',
      child_session_id: 'session_child',
      agent_id: 'geospatial',
      title: 'geospatial #1',
      state: 'completed' as const,
      summary: 'main <- geospatial',
      task: 'Ground the requested region before catalog search.',
      result: 'Resolved the region with authoritative coordinates.',
      duration_ms: 12_500,
    };

    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_child',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [{ id: 'block_child', type: 'subagent', subagent_id: child.id }],
          },
        ]}
        onOpenSubagent={onOpenSubagent}
        subagents={{ [child.id]: child }}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(
      screen.getByText('Ground the requested region before catalog search.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Resolved the region with authoritative coordinates.'),
    ).toBeInTheDocument();

    const dispatch = screen.getByRole('button', {
      name: 'Open child conversation geospatial #1',
    });
    fireEvent.click(dispatch);
    expect(onOpenSubagent).toHaveBeenLastCalledWith(child, 'conversation');

    fireEvent.click(dispatch, { shiftKey: true });
    expect(onOpenSubagent).toHaveBeenLastCalledWith(child, 'canvas');
  });

  it('keeps the sourced tool outcome readable inside a compact activity chain', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_work',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [
              { id: 'reason_before', type: 'reasoning', text: 'Preparing to inspect evidence.' },
              { id: 'tool_block', type: 'tool', tool_id: 'tool_read' },
              { id: 'reason_after', type: 'reasoning', text: 'Formatting the response.' },
            ],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{
          tool_read: {
            id: 'tool_read',
            session_id: 'session_1',
            name: 'fs_read_file',
            title: 'Read evidence file',
            state: 'succeeded',
            input: { path: 'D:/campaign/evidence.json' },
            output: 'large payload omitted from the collapsed summary',
          },
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Activity' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const activity = screen.getByRole('button', {
      name: /Expand activity:.*Read evidence file.*Read evidence\.json/,
    });
    expect(activity).toBeInTheDocument();
    expect(activity).not.toHaveAccessibleName(/Completed/);
    expect(screen.getByRole('radio', { name: 'Full activity view' })).toBeInTheDocument();
  });

  it('opens a compact chain as the full causal turn and can condense it again', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_activity',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [
              { id: 'reason_1', type: 'reasoning', text: 'Inspecting the evidence.' },
              { id: 'progress_1', type: 'text', text: 'I found the candidate file.' },
              { id: 'tool_1', type: 'tool', tool_id: 'tool_read' },
              { id: 'answer_1', type: 'text', text: 'The evidence is ready.' },
            ],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{
          tool_read: {
            id: 'tool_read',
            session_id: 'session_1',
            name: 'fs_read_file',
            title: 'Read evidence file',
            state: 'succeeded',
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Full activity view' }));

    expect(screen.getByRole('region', { name: 'Full agent activity' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Chain view' }));
    expect(screen.queryByRole('region', { name: 'Full agent activity' })).not.toBeInTheDocument();
  });

  it('distinguishes a deliberately removed interactive surface from unavailable data', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_surface',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [{ id: 'block_surface', type: 'a2ui', surface_id: 'surface_1' }],
          },
        ]}
        subagents={{}}
        surfaces={{
          surface_1: {
            id: 'surface_1',
            session_id: 'session_1',
            catalog_id: 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1',
            protocol_version: '0.9.1',
            revision: 3,
            state: 'deleted',
            messages: [],
          },
        }}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.getByText('Interactive surface removed')).toBeInTheDocument();
    expect(screen.queryByText('Interactive surface unavailable')).not.toBeInTheDocument();
  });
});
