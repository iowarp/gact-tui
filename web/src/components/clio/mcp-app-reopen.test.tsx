import { TransportError, type ClioRepository, type McpAppReopenResult } from '@clio/core/v3';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  noteMcpApp,
  OPEN_MCP_APP_TAB_EVENT,
  resetMcpAppLiveSet,
  returnMcpAppToConversation,
  standInForCard,
  useMcpAppLiveSet,
  useMcpAppLiveSetStore,
  useMcpAppPresence,
} from './mcp-app-live-set';
import { McpAppReopenableCard, McpAppReopenLine, McpAppRestoringTab } from './mcp-app-reopen';
import { formatArguments, setReopenedMcpApp } from './mcp-app-reopen-store';

const restoringRepository = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => restoringRepository.current }));

class ManualResizeObserver {
  constructor(private readonly callback: () => void) {
    resizeObservers.add(this);
  }
  fire() {
    this.callback();
  }
  observe() {}
  unobserve() {}
  disconnect() {
    resizeObservers.delete(this);
  }
}
const resizeObservers = new Set<ManualResizeObserver>();
vi.stubGlobal('ResizeObserver', ManualResizeObserver);

const savedCall = {
  server: 'boards',
  tool: 'open_board',
  arguments: { title: 'Q3', count: 4 },
  display_mode: 'inline' as const,
  resource_uri: 'ui://boards/view',
  label: 'Open a board',
};

const fresh: McpAppReopenResult = {
  ok: true,
  savedCall: { ...savedCall, reopened_from: 'app_1' },
  view: {
    appInstanceId: 'app_2',
    dataRef: 'ref_2',
    resourceUri: 'ui://boards/view',
    sourceServer: 'boards',
    toolName: 'boards_open_board',
    displayMode: 'inline',
  },
};

function repository(results: McpAppReopenResult[]) {
  return {
    reopenMcpApp: vi.fn(async () => results.shift() as McpAppReopenResult),
    mcpAppLive: vi.fn(
      async (identity: { appInstanceId: string }) => identity.appInstanceId !== 'app_1',
    ),
    mcpAppDescriptor: vi.fn(async (identity: { appInstanceId: string }) => {
      if (identity.appInstanceId === 'app_1') {
        throw new TransportError('MCP App instance not found', 404, 'not_found');
      }
      return new Promise(() => undefined);
    }),
    callMcpAppTool: vi.fn(),
    readMcpAppResource: vi.fn(),
    updateMcpAppModelContext: vi.fn(),
    postMcpAppMessage: vi.fn(),
    closeMcpApp: vi.fn(async () => undefined),
    setMcpAppDisplayMode: vi.fn(async () => ({ display_mode: 'fullscreen', pinned: true })),
    pinMcpApp: vi.fn(),
  };
}

const line = {
  appInstanceId: 'app_1',
  sessionId: 'sess_1',
  sourceServer: 'boards',
  toolName: 'boards_open_board',
};

afterEach(() => {
  cleanup();
  setReopenedMcpApp('sess_1', 'app_1', undefined);
  window.localStorage.clear();
  resetMcpAppLiveSet();
});

describe('McpAppReopenLine', () => {
  it('replays the saved call and hands the fresh view back', async () => {
    const repo = repository([fresh]);
    const onReopened = vi.fn();
    render(<McpAppReopenLine {...line} onReopened={onReopened} repository={repo} />);

    expect(screen.getByText('View closed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));

    await waitFor(() => expect(onReopened).toHaveBeenCalledWith(fresh.view, fresh.savedCall));
    expect(repo.reopenMcpApp).toHaveBeenCalledWith('sess_1', 'app_1');
  });

  it('shows the reason and the saved call, and retries', async () => {
    const repo = repository([
      {
        ok: false,
        reason: 'tool_error',
        detail: 'The board service is unavailable right now.',
        savedCall,
      },
      fresh,
    ]);
    const onReopened = vi.fn();
    render(<McpAppReopenLine {...line} onReopened={onReopened} repository={repo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));

    expect(await screen.findByText('The board service is unavailable right now.')).toBeTruthy();
    expect(screen.getByText('Open a board from boards')).toBeTruthy();
    expect(screen.getByText('title: "Q3", count: 4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onReopened).toHaveBeenCalledTimes(1));
  });

  it('offers no Retry when nothing was saved', async () => {
    const repo = repository([
      { ok: false, reason: 'no_saved_call', detail: 'Not saved.', savedCall: null },
    ]);
    render(<McpAppReopenLine {...line} onReopened={vi.fn()} repository={repo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(await screen.findByText('Not saved.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('replays at once for a restored view', async () => {
    const repo = repository([fresh]);
    const onReopened = vi.fn();
    render(<McpAppReopenLine {...line} autoReopen onReopened={onReopened} repository={repo} />);
    await waitFor(() => expect(onReopened).toHaveBeenCalledTimes(1));
    expect(repo.reopenMcpApp).toHaveBeenCalledTimes(1);
  });
});

describe('McpAppReopenableCard', () => {
  const block = {
    app_instance_id: 'app_1',
    data_ref: 'ref_1',
    resource_uri: 'ui://boards/view',
    source_server: 'boards',
    tool_name: 'boards_open_board',
  };

  it('offers reopen when CLIO no longer holds the view, then mounts the fresh one', async () => {
    useMcpAppLiveSetStore.setState({ apps: {}, latest: { sess_1: 'app_1' } });
    const repo = repository([fresh]);
    const { container } = render(
      <TooltipProvider>
        <McpAppReopenableCard
          block={block}
          repository={repo as unknown as ClioRepository}
          sessionId="sess_1"
        />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Reopen' }));

    await waitFor(() => expect(container.querySelector('[data-mcp-app="app_2"]')).toBeTruthy());
    expect(repo.mcpAppDescriptor).not.toHaveBeenCalledWith(
      expect.objectContaining({ appInstanceId: 'app_1' }),
      expect.anything(),
    );
    expect(repo.mcpAppDescriptor).toHaveBeenLastCalledWith(
      { sessionId: 'sess_1', appInstanceId: 'app_2', dataRef: 'ref_2' },
      expect.anything(),
    );
  });

  it('reopens a view saved in a tab into its tab', async () => {
    useMcpAppLiveSetStore.setState({ apps: {}, latest: { sess_1: 'app_9' } });
    const opened = vi.fn();
    window.addEventListener(OPEN_MCP_APP_TAB_EVENT, opened);
    const repo = repository([{ ...fresh, view: { ...fresh.view, displayMode: 'fullscreen' } }]);
    render(
      <McpAppReopenableCard
        block={block}
        repository={repo as unknown as ClioRepository}
        sessionId="sess_1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));

    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1));
    expect((opened.mock.calls[0]![0] as CustomEvent).detail).toMatchObject({
      appInstanceId: 'app_2',
      dataRef: 'ref_2',
    });
    expect(await screen.findByText('Open in a tab')).toBeTruthy();
    expect(repo.setMcpAppDisplayMode).toHaveBeenCalledWith(
      { sessionId: 'sess_1', appInstanceId: 'app_2', dataRef: 'ref_2' },
      'fullscreen',
    );
    window.removeEventListener(OPEN_MCP_APP_TAB_EVENT, opened);
  });

  it('shows the reopen line for an older card the live set closed', () => {
    useMcpAppLiveSetStore.setState({ apps: {}, latest: { sess_1: 'app_9' } });
    const repo = repository([]);
    render(
      <McpAppReopenableCard
        block={block}
        repository={repo as unknown as ClioRepository}
        sessionId="sess_1"
      />,
    );
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeTruthy();
    expect(repo.mcpAppLive).not.toHaveBeenCalled();
  });
});

describe('a reopened view in the live set (MA2, MA5)', () => {
  const view = (appInstanceId: string) => ({
    label: 'Open a board',
    appInstanceId,
    dataRef: `${appInstanceId}_ref`,
    sessionId: 'sess_1',
    resourceUri: 'ui://boards/view',
    sourceServer: 'boards',
    toolName: 'boards_open_board',
  });
  const liveSetRepository = () => ({
    closeMcpApp: vi.fn(async () => undefined),
    setMcpAppDisplayMode: vi.fn(async () => ({ display_mode: 'inline', pinned: false })),
    pinMcpApp: vi.fn(),
  });

  it('returns to its card when its tab closes, if its card is the latest', () => {
    const repo = liveSetRepository();
    useMcpAppLiveSetStore.setState({ apps: {}, latest: { sess_1: 'card_1' } });
    noteMcpApp(view('reopened_1'), repo, 'tab');
    standInForCard('reopened_1', 'card_1');

    returnMcpAppToConversation('reopened_1');

    expect(useMcpAppLiveSetStore.getState().apps.reopened_1?.placement).toBe('inline');
    expect(repo.setMcpAppDisplayMode).toHaveBeenCalledWith(
      { sessionId: 'sess_1', appInstanceId: 'reopened_1', dataRef: 'reopened_1_ref' },
      'inline',
    );
    expect(repo.closeMcpApp).not.toHaveBeenCalled();
    const presence = renderHook(() => useMcpAppPresence('reopened_1', 'sess_1'));
    expect(presence.result.current).toEqual({ placement: 'inline', latest: true });
  });

  it('closes with its tab when its card is an older one', () => {
    const repo = liveSetRepository();
    useMcpAppLiveSetStore.setState({ apps: {}, latest: { sess_1: 'card_2' } });
    noteMcpApp(view('reopened_1'), repo, 'tab');
    standInForCard('reopened_1', 'card_1');

    returnMcpAppToConversation('reopened_1');

    expect(useMcpAppLiveSetStore.getState().apps.reopened_1?.placement).toBe('ended');
    expect(repo.closeMcpApp).toHaveBeenCalledTimes(1);
  });

  it('is closed when a newer App becomes the latest, like the card it stands for', () => {
    const repo = liveSetRepository();
    const message = (id: string, apps: string[]) => ({
      id,
      session_id: 'sess_1',
      role: 'assistant' as const,
      created_at: '2026-11-13T00:00:00Z',
      blocks: apps.map((app) => ({
        id: `${app}_part`,
        type: 'mcp_app' as const,
        app_instance_id: app,
        data_ref: `${app}_ref`,
        resource_uri: 'ui://boards/view',
        source_server: 'boards',
        tool_name: 'boards_open_board',
        mime_type: 'text/html;profile=mcp-app',
      })),
    });
    const hook = renderHook(({ messages }) => useMcpAppLiveSet('sess_1', messages as never, repo), {
      initialProps: { messages: [message('m1', ['card_1'])] },
    });
    noteMcpApp(view('reopened_1'), repo, 'inline');
    standInForCard('reopened_1', 'card_1');

    hook.rerender({ messages: [message('m1', ['card_1']), message('m2', ['card_2'])] });

    expect(useMcpAppLiveSetStore.getState().apps.reopened_1?.placement).toBe('ended');
    expect(repo.closeMcpApp).toHaveBeenCalledWith({
      sessionId: 'sess_1',
      appInstanceId: 'reopened_1',
      dataRef: 'reopened_1_ref',
    });
  });
});

describe('McpAppRestoringTab', () => {
  const target = {
    label: 'Open a board',
    appInstanceId: 'app_1',
    dataRef: 'ref_1',
    sessionId: 'sess_1',
    resourceUri: 'ui://boards/view',
    sourceServer: 'boards',
    toolName: 'boards_open_board',
  };

  it("replays a restored tab when it is first shown and becomes the fresh view's tab", async () => {
    const repo = repository([fresh]);
    restoringRepository.current = repo;
    const onReplaceTab = vi.fn();
    const sizes = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(0);
    render(<McpAppRestoringTab onReplaceTab={onReplaceTab} target={target} />);

    await screen.findByRole('button', { name: 'Reopen' });
    expect(repo.reopenMcpApp).not.toHaveBeenCalled(); // hidden: not replayed yet
    // Its card already points at the tab.
    expect(useMcpAppLiveSetStore.getState().apps.app_1?.placement).toBe('tab');

    sizes.mockReturnValue(800);
    for (const observer of resizeObservers) observer.fire();

    await waitFor(() => expect(onReplaceTab).toHaveBeenCalledTimes(1));
    expect(repo.reopenMcpApp).toHaveBeenCalledWith('sess_1', 'app_1');
    expect(onReplaceTab.mock.calls[0]).toEqual([
      'mcp-app:app_1',
      expect.objectContaining({ id: 'mcp-app:app_2', kind: 'mcp-app', label: 'Open a board' }),
    ]);
    expect(useMcpAppLiveSetStore.getState().apps.app_2?.placement).toBe('tab');
    sizes.mockRestore();
  });

  it('keeps a failed replay in the tab with the reason and Retry', async () => {
    const repo = repository([
      { ok: false, reason: 'tool_error', detail: 'The board service is down.', savedCall },
    ]);
    restoringRepository.current = repo;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    render(<McpAppRestoringTab onReplaceTab={vi.fn()} target={target} />);
    for (const observer of resizeObservers) observer.fire();

    expect(await screen.findByText('The board service is down.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    vi.restoreAllMocks();
  });
});

describe('formatArguments', () => {
  it('reads arguments for a person', () => {
    expect(formatArguments(savedCall)).toBe('title: "Q3", count: 4');
    expect(formatArguments({ ...savedCall, arguments: null })).toBe('arguments not saved');
    expect(formatArguments({ ...savedCall, arguments: {} })).toBe('no arguments');
  });
});
