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

    fireEvent.click(screen.getByRole('button', { name: 'Open in canvas' }));
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
    expect(
      screen.getByRole('button', {
        name: /Read evidence file.*Read evidence\.json\..*Completed/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show full activity for this turn' }),
    ).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Show full activity for this turn' }));

    expect(screen.getByText('Full agent activity')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use chain view for this turn' }));
    expect(
      screen.getByRole('button', { name: 'Show full activity for this turn' }),
    ).toBeInTheDocument();
  });

  it('makes metadata-only model reasoning discoverable and renders the complete capture in full mode', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_reasoning',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [],
            reasoning_calls: [
              {
                id: 'reasoning_call_1',
                model: 'anthropic/claude-opus-4-1',
                question: 'Inspect the complete campaign evidence.',
                reasoning:
                  'This is the complete provider reasoning captured for the model call, not a short transcript summary.',
                response: 'The campaign evidence supports the reported conclusion.',
                reasoning_chars: 101,
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

    expect(screen.getByText('1 additional captured model call')).toBeInTheDocument();
    expect(screen.queryByText(/complete provider reasoning captured/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show full activity for this turn' }));

    expect(screen.getByText(/complete provider reasoning captured/)).toBeInTheDocument();
    expect(screen.getByText(/Prompt: Inspect the complete campaign evidence/)).toBeInTheDocument();
    expect(
      screen.getByText(/The campaign evidence supports the reported conclusion/),
    ).toBeInTheDocument();
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
