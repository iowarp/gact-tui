// Message content, attachments, resources, steers, transcript state, and recovery
// actions live in `conversation.test.tsx`; scroll/virtualization/minimap behaviour
// lives in `conversation-viewport.test.tsx`. This file covers the child-agent and
// tool-activity chain rendering, and interactive-surface routing.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

describe('ClioConversation activity and interactive surfaces', () => {
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
            presentation: { summary: 'Read evidence.json', blocks: [] },
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

  it('renders a tool-returned task as a quiet status line inside Activity', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_task',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-22T00:00:00Z',
            blocks: [
              { id: 'reason_task', type: 'reasoning', text: 'Review the station evidence.' },
              { id: 'tool_task', type: 'tool', tool_id: 'tool_read' },
              { id: 'task_block', type: 'task', task_id: 'task_quality' },
            ],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{
          task_quality: {
            id: 'task_quality',
            session_id: 'session_1',
            title: 'Review station quality',
            state: 'completed',
            detail: 'Evidence retained with source identity.',
          },
        }}
        tools={{
          tool_read: {
            id: 'tool_read',
            session_id: 'session_1',
            name: 'ndp_search_datasets',
            title: 'Search EarthScope catalog',
            state: 'succeeded',
          },
        }}
      />,
    );

    const taskLine = document.querySelector('[data-turn-activity="task:task_quality"]');
    if (!taskLine) throw new Error('the task activity line was not rendered');
    expect(taskLine).toBeInTheDocument();
    expect(taskLine).toHaveTextContent('Review station quality');
    expect(taskLine).toHaveTextContent('Completed');
    expect(taskLine).toHaveTextContent('Evidence retained with source identity.');
    expect(taskLine).not.toHaveTextContent('completed.');
    expect(taskLine.closest('button')).toHaveAccessibleName(/Expand activity/);
    expect(
      screen.queryByRole('button', { name: 'Review station quality' }),
    ).not.toBeInTheDocument();
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

  it('leaves a pending interactive surface to the response stack and hides empty routing noise', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        interactions={[
          {
            id: 'a2ui:session_1:surface_1',
            kind: 'a2ui',
            owner_session_id: 'session_1',
            attended_session_id: 'session_1',
            status: 'pending',
            title: 'Interactive surface',
            source: { protocol: 'native', surface_id: 'surface_1' },
            created_at: '2026-09-09T00:00:00Z',
          },
        ]}
        messages={[
          {
            id: 'message_surface',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-09-09T00:00:00Z',
            blocks: [
              { id: 'block_surface', type: 'a2ui', surface_id: 'surface_1' },
              { id: 'routing_placeholder', type: 'routing', label: 'Unknown' },
            ],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.queryByLabelText('Agent-created view')).not.toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
  });
});
