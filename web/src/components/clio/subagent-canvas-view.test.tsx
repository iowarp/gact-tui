import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubagentRun, TranscriptSnapshot, TransportFrame } from '@clio/core/v3';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';

const mocks = vi.hoisted(() => ({
  repository: {
    stream: vi.fn(),
    transcript: vi.fn(),
  },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => mocks.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
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
    scrollToIndex: () => undefined,
  }),
}));

import { ClioSubagentCanvasView } from './subagent-canvas-view';

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

afterEach(() => {
  cleanup();
  mocks.repository.stream.mockReset();
  mocks.repository.transcript.mockReset();
});

const subagent: SubagentRun = {
  id: 'task_child',
  session_id: 'sess_parent',
  child_session_id: 'sess_child',
  title: 'geospatial #1',
  state: 'running',
  task: 'Ground the requested region.',
};

const snapshot: TranscriptSnapshot = {
  cursor: '40',
  messages: [
    {
      id: 'msg_snapshot',
      session_id: 'sess_child',
      role: 'assistant',
      created_at: '2026-08-27T12:00:00Z',
      blocks: [{ id: 'block_snapshot', type: 'text', text: 'Snapshot answer' }],
    },
  ],
  tools: [],
  tasks: [],
  subagents: [],
  artifacts: [],
  surfaces: [],
};

function messageFrame(cursor: string, id: string, text: string): TransportFrame {
  return {
    cursor,
    eventName: 'message.upserted',
    receivedAt: '2026-08-27T12:00:01Z',
    data: {
      protocol_version: '0.3',
      type: 'message.upserted',
      occurred_at: '2026-08-27T12:00:01Z',
      scope: { connection_id: 'active', workspace_id: 'ws_1', session_id: 'sess_child' },
      entity_id: id,
      entity_revision: Number(cursor),
      payload: {
        id,
        session_id: 'sess_child',
        role: 'assistant',
        created_at: '2026-08-27T12:00:01Z',
        blocks: [{ id: `${id}_block`, type: 'text', text }],
      },
    },
  };
}

function renderCanvas(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppearanceProvider>
        <ConversationDisplayProvider>{element}</ConversationDisplayProvider>
      </AppearanceProvider>
    </QueryClientProvider>,
  );
}

function canvas() {
  return (
    <ClioSubagentCanvasView
      activeSessionId="sess_parent"
      onOpenArtifact={vi.fn()}
      onOpenConversation={vi.fn()}
      onOpenFile={vi.fn()}
      onOpenSubagent={vi.fn()}
      subagent={subagent}
      workspaceId="ws_1"
    />
  );
}

describe('ClioSubagentCanvasView live stream', () => {
  it('contains one unreadable frame instead of losing its batch', async () => {
    mocks.repository.transcript.mockResolvedValue(snapshot);
    mocks.repository.stream.mockImplementation(async function* (
      _scope: unknown,
      _cursor: unknown,
      signal: AbortSignal,
    ) {
      yield {
        cursor: '41',
        eventName: 'message.upserted',
        receivedAt: '2026-08-27T12:00:01Z',
        data: { protocol_version: '0.3', broken: true },
      };
      yield messageFrame('42', 'msg_live', 'Live child answer');
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });

    renderCanvas(canvas());

    await waitFor(() => expect(screen.getByText('Live child answer')).toBeInTheDocument(), {
      timeout: 5_000,
    });
    expect(screen.getByText('Snapshot answer')).toBeInTheDocument();
  });

  it('reopens the child stream after the service closes it', async () => {
    mocks.repository.transcript.mockResolvedValue(snapshot);
    mocks.repository.stream.mockImplementation(async function* (
      _scope: unknown,
      _cursor: unknown,
      signal: AbortSignal,
    ) {
      if (mocks.repository.stream.mock.calls.length > 1) {
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return;
      }
      // The service ends the child stream normally: the generator returns.
      yield messageFrame('41', 'msg_live', 'Live child answer');
    });

    renderCanvas(canvas());

    await waitFor(() => expect(screen.getByText('Live child answer')).toBeInTheDocument(), {
      timeout: 5_000,
    });
    await waitFor(() => expect(mocks.repository.stream).toHaveBeenCalledTimes(2), {
      timeout: 5_000,
    });
    await waitFor(() => expect(screen.getByText('Reconnecting')).toBeVisible(), {
      timeout: 5_000,
    });
    expect(mocks.repository.stream).toHaveBeenLastCalledWith(
      { connection_id: 'active', workspace_id: 'ws_1', session_id: 'sess_child' },
      '41',
      expect.any(AbortSignal),
    );
  });
});
