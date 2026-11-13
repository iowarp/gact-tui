import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useEffect, useImperativeHandle, type Ref } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { A2uiReferenceSessionProvider } from '@/lib/a2ui/reference-session';
import { ClioMcpApp, type McpAppDataContext } from './a2ui-mcp-app';
import type { McpAppSurfaceHandle } from './mcp-app-surface';

const surface = vi.hoisted(() => ({
  onModelContext: undefined as ((context: Record<string, unknown>) => void) | undefined,
  handle: {
    callAppTool: vi.fn(async () => ({ content: [] })),
    sendToolInput: vi.fn(),
    sendToolResult: vi.fn(),
    request: vi.fn(),
  },
  props: undefined as Record<string, unknown> | undefined,
}));

const repository = vi.hoisted(() => ({
  openMcpAppFromCall: vi.fn(),
  callMcpAppTool: vi.fn(
    async (): Promise<unknown> => ({ content: [{ type: 'text', text: 'moved' }] }),
  ),
  closeMcpApp: vi.fn(async () => undefined),
  pinMcpApp: vi.fn(async () => ({ display_mode: 'inline', pinned: true })),
  setMcpAppDisplayMode: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('./mcp-app-surface', () => ({
  McpAppSurface: forwardRef(function FakeSurface(
    props: Record<string, unknown>,
    ref: Ref<McpAppSurfaceHandle>,
  ) {
    useEffect(() => {
      surface.onModelContext = props.onModelContext as typeof surface.onModelContext;
      surface.props = props;
    });
    useImperativeHandle(ref, () => surface.handle, []);
    return <div data-testid="frame">{String(props.placement)}</div>;
  }),
}));

function dataContext() {
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  const model = new Map<string, unknown>();
  const context: McpAppDataContext & { model: Map<string, unknown> } = {
    model,
    set: vi.fn((path: string, value: unknown) => {
      model.set(path, value);
      listeners.get(path)?.forEach((listener) => listener(value));
    }),
    subscribeDynamicValue: (value: never, onChange: (value: unknown) => void) => {
      const path = (value as { path: string }).path;
      const set = listeners.get(path) ?? new Set();
      set.add(onChange);
      listeners.set(path, set);
      return { unsubscribe: () => set.delete(onChange) };
    },
  };
  return context;
}

const OPENED = {
  ok: true,
  view: {
    appInstanceId: 'app_1',
    dataRef: 'ref_1',
    resourceUri: 'ui://timeline/view',
    sourceServer: 'timeline',
    toolName: 'timeline_open_timeline',
    displayMode: 'inline',
  },
  savedCall: null,
  serverTools: ['open_timeline', 'set_time'],
};

function renderApp(context = dataContext(), surfaceId = 's1') {
  render(
    <A2uiReferenceSessionProvider value="sess_1">
      <ClioMcpApp
        args={{ steps: 24 }}
        channels={[{ key: 'time', path: '/selection/time', tool: 'set_time' }]}
        componentId="app"
        dataContext={context}
        height={360}
        server="timeline"
        surfaceId={surfaceId}
        tool="open_timeline"
      />
    </A2uiReferenceSessionProvider>,
  );
  return context;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ClioMcpApp', () => {
  it('opens its call, pins the view and links the time channel both ways', async () => {
    repository.openMcpAppFromCall.mockResolvedValue(OPENED);
    const context = renderApp(undefined, 'linked');
    expect(screen.getByText('Opening the open_timeline view')).toBeVisible();
    await screen.findByTestId('frame');
    expect(repository.openMcpAppFromCall).toHaveBeenCalledWith('sess_1', {
      server: 'timeline',
      tool: 'open_timeline',
      arguments: { steps: 24 },
    });
    expect(surface.props?.placement).toBe('surface');
    expect(repository.pinMcpApp).toHaveBeenCalledWith(
      { sessionId: 'sess_1', appInstanceId: 'app_1', dataRef: 'ref_1' },
      true,
    );
    expect(screen.getByText('linked both ways')).toBeVisible();

    vi.useFakeTimers();
    act(() => surface.onModelContext?.({ structuredContent: { time: 5 } }));
    act(() => vi.advanceTimersByTime(100));
    vi.useRealTimers();
    expect(context.model.get('/selection/time')).toEqual({
      field: 'time',
      values: [5],
      source: 'app',
    });
    expect(repository.callMcpAppTool).not.toHaveBeenCalled();

    act(() => context.set('/selection/time', { field: 'time', values: [9], source: 'chart' }));
    await waitFor(() =>
      expect(repository.callMcpAppTool).toHaveBeenCalledWith(
        { sessionId: 'sess_1', appInstanceId: 'app_1', dataRef: 'ref_1' },
        { name: 'set_time', arguments: { time: 9 } },
      ),
    );
    await waitFor(() => expect(surface.handle.sendToolResult).toHaveBeenCalled());
    expect(surface.handle.sendToolInput).toHaveBeenCalledWith({ time: 9 });
    const row = document.querySelector('[data-mcp-app-channel="time"]') as HTMLElement;
    expect(row.dataset.writes).toBe('1');
    expect(row.dataset.toolCalls).toBe('1');
  });

  it('shows why the view could not open, with the call and Retry', async () => {
    repository.openMcpAppFromCall
      .mockResolvedValueOnce({
        ok: false,
        reason: 'tool_unavailable',
        detail: 'The timeline service is not connected.',
        savedCall: null,
        serverTools: [],
      })
      .mockResolvedValueOnce(OPENED);
    renderApp(undefined, 'failing');
    expect(await screen.findByText('The open_timeline view could not open')).toBeVisible();
    expect(screen.getByText('The timeline service is not connected.')).toBeVisible();
    expect(screen.getByText('open_timeline on timeline')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByTestId('frame');
    expect(repository.openMcpAppFromCall).toHaveBeenCalledTimes(2);
  });

  it('says in words when a channel tool fails', async () => {
    repository.openMcpAppFromCall.mockResolvedValue(OPENED);
    repository.callMcpAppTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: 'text', text: 'time out of range' }],
    });
    const context = renderApp(undefined, 'failing-tool');
    await screen.findByTestId('frame');
    act(() => context.set('/selection/time', { field: 'time', values: [99] }));
    expect(await screen.findByText('Could not change time: time out of range')).toBeVisible();
  });
});
