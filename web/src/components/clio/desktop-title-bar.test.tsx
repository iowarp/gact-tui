import { clearDesktopHost, mockDesktopHost } from '@/test/desktop-host';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StreamState } from '@clio/core/v3';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { brand } from '@brand';
import { MENU_ACTION_EVENT, useMenuAction, type MenuAction } from '@/tauri/menu-actions';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useDesktopTitleStore } from '@/store/desktop-title';
import { DesktopTitleBar } from './desktop-title-bar';

const runDesktopWindowAction = vi.hoisted(() => vi.fn(async () => undefined));
const ackClosePromptShown = vi.hoisted(() => vi.fn(async (_seq: number) => undefined));
const listenForCloseRequested = vi.hoisted(() =>
  vi.fn(async (_onCloseRequested: (seq: number) => void) => () => undefined),
);
const listenForCloseFallbackHidden = vi.hoisted(() =>
  vi.fn(async (_onHidden: () => void) => () => undefined),
);
const ackQuitPromptShown = vi.hoisted(() =>
  vi.fn(async (_seq: number, _showWindow: boolean) => undefined),
);
const listenForQuitRequested = vi.hoisted(() =>
  vi.fn(async (_onQuitRequested: (seq: number) => void) => () => undefined),
);
const toastError = vi.hoisted(() => vi.fn());
const isMacOS = vi.hoisted(() => vi.fn(() => false));
const liveStreamState = vi.hoisted(() => ({ current: 'live' as StreamState }));
const capabilitiesService = vi.hoisted(() => ({
  current: { name: 'clio-agent-gact', version: '1.2.3' } as
    | { name: string; version: string }
    | undefined,
}));

vi.mock('@/tauri/desktop-window', () => ({
  runDesktopWindowAction,
  ackClosePromptShown,
  ackQuitPromptShown,
}));

vi.mock('@/tauri/desktop-lifecycle', () => ({
  listenForCloseRequested,
  listenForCloseFallbackHidden,
  listenForQuitRequested,
}));

vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), error: toastError } }));

vi.mock('@/lib/platform', () => ({ isMacOS }));

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

const switchConnection = vi.hoisted(() => vi.fn(async (_connection: unknown) => undefined));
vi.mock('@/hooks/use-switch-connection', () => ({
  useSwitchConnection: () => switchConnection,
}));
vi.mock('@/hooks/use-known-connections', () => ({
  useKnownConnections: () => [
    {
      endpoint: 'http://127.0.0.1',
      label: 'This computer',
      source: 'recent',
      availability: { state: 'available', label: 'Ready', detail: 'Ready.' },
    },
    {
      endpoint: 'https://aurora.example:8787',
      label: 'Aurora',
      source: 'recent',
      availability: { state: 'available', label: 'Ready', detail: 'Ready.' },
    },
  ],
}));

vi.mock('@/hooks/use-workspace-capabilities', () => ({
  useWorkspaceCapabilities: () => ({
    capabilities: { data: { service: capabilitiesService.current } },
  }),
}));

vi.mock('@/store/live-store', () => ({
  useLiveStore: (
    selector: (state: { entities: { stream: string }; streamOwners: number }) => unknown,
  ) => selector({ entities: { stream: liveStreamState.current }, streamOwners: 1 }),
}));

function MenuWorkflow({ action, handler }: { action: MenuAction; handler: () => void }) {
  useMenuAction(action, handler);
  return null;
}

/** Stands in for the screens that own each menu workflow in the app. */
function MenuWorkflows({ actions }: { actions: Partial<Record<MenuAction, () => void>> }) {
  return Object.entries(actions).map(([action, handler]) =>
    handler ? <MenuWorkflow action={action as MenuAction} handler={handler} key={action} /> : null,
  );
}

describe('DesktopTitleBar', () => {
  let queryClient: QueryClient;
  const renderTitleBar = (workflows?: ReactNode) =>
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {workflows}
          <DesktopTitleBar />
        </TooltipProvider>
      </QueryClientProvider>,
    );

  beforeEach(() => {
    mockDesktopHost();
    queryClient = new QueryClient();
    runDesktopWindowAction.mockClear();
    ackClosePromptShown.mockClear();
    ackQuitPromptShown.mockClear();
    listenForQuitRequested.mockClear();
    listenForQuitRequested.mockImplementation(async () => () => undefined);
    listenForCloseRequested.mockClear();
    listenForCloseRequested.mockImplementation(async () => () => undefined);
    listenForCloseFallbackHidden.mockClear();
    listenForCloseFallbackHidden.mockImplementation(async () => () => undefined);
    toastError.mockClear();
    isMacOS.mockReturnValue(false);
    liveStreamState.current = 'live';
    capabilitiesService.current = { name: 'clio-agent-gact', version: '1.2.3' };
    useDesktopTitleStore.getState().clearTitleContext();
  });

  afterEach(() => {
    cleanup();
    clearDesktopHost();
  });

  it('title_bar_hidden_in_browser: stays out of the browser experience', () => {
    clearDesktopHost();
    const { container } = renderTitleBar();
    expect(container).toBeEmptyDOMElement();
  });

  it('offers navigation and keeps close lifecycle choices explicit', async () => {
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const historyForward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined);
    renderTitleBar();

    expect(screen.getByRole('banner', { name: /desktop controls/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go forward' }));
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximize or restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent(`Keep ${brand.productName} running?`);
    expect(runDesktopWindowAction).not.toHaveBeenCalledWith('close');
    fireEvent.click(screen.getByRole('button', { name: 'Keep running' }));

    expect(historyBack).toHaveBeenCalledOnce();
    expect(historyForward).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(runDesktopWindowAction).toHaveBeenNthCalledWith(1, 'minimize');
      expect(runDesktopWindowAction).toHaveBeenNthCalledWith(2, 'toggleMaximize');
      expect(runDesktopWindowAction).toHaveBeenNthCalledWith(3, 'hide');
    });
  });

  it('keep_running_hides: "Keep running" hides the window and closes the prompt', async () => {
    renderTitleBar();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep running' }));

    await waitFor(() => expect(runDesktopWindowAction).toHaveBeenCalledWith('hide'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('can quit CLIO and its local services from the close prompt', async () => {
    renderTitleBar();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: `Quit ${brand.productName}` }));

    await waitFor(() => expect(runDesktopWindowAction).toHaveBeenCalledWith('quit'));
  });

  it('quit_invokes_quit_clio_without_toast_on_rejection: a rejected quit invoke never toasts', async () => {
    runDesktopWindowAction.mockRejectedValueOnce(new Error('teardown already unwound the WebView'));
    renderTitleBar();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: `Quit ${brand.productName}` }));

    await waitFor(() => expect(runDesktopWindowAction).toHaveBeenCalledWith('quit'));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a rejected non-quit action still toasts', async () => {
    runDesktopWindowAction.mockRejectedValueOnce(new Error('boom'));
    renderTitleBar();

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        expect.stringContaining('could not update the desktop window'),
      ),
    );
  });

  it('dismisses the close prompt from its close button or backdrop without hiding CLIO', () => {
    const { container } = renderTitleBar();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss close prompt' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const backdrop = container.ownerDocument.querySelector('[data-slot="alert-dialog-overlay"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(runDesktopWindowAction).not.toHaveBeenCalled();
  });

  it('escape_dismisses_without_window_action: Escape dismisses the prompt only', () => {
    renderTitleBar();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(runDesktopWindowAction).not.toHaveBeenCalled();
  });

  it('native_close_request_opens_prompt: a native close request opens the same prompt and acks its seq', async () => {
    renderTitleBar();

    await waitFor(() => expect(listenForCloseRequested).toHaveBeenCalledTimes(1));
    const onCloseRequested = listenForCloseRequested.mock.calls[0]?.[0];
    expect(onCloseRequested).toBeTypeOf('function');

    act(() => onCloseRequested?.(7));

    expect(screen.getByRole('alertdialog')).toHaveTextContent(`Keep ${brand.productName} running?`);
    // Correlated by seq, not a bare boolean flag — see the fix for the
    // Alt+F4-pressed-twice race.
    expect(ackClosePromptShown).toHaveBeenCalledOnce();
    expect(ackClosePromptShown).toHaveBeenCalledWith(7);
    expect(runDesktopWindowAction).not.toHaveBeenCalled();
  });

  it('a native fallback-hide notice clears a stale prompt instead of leaving it rendered', async () => {
    renderTitleBar();

    await waitFor(() => expect(listenForCloseRequested).toHaveBeenCalledTimes(1));
    const onCloseRequested = listenForCloseRequested.mock.calls[0]?.[0];
    act(() => onCloseRequested?.(1));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await waitFor(() => expect(listenForCloseFallbackHidden).toHaveBeenCalledTimes(1));
    const onFallbackHidden = listenForCloseFallbackHidden.mock.calls[0]?.[0];
    expect(onFallbackHidden).toBeTypeOf('function');

    // Rust hid the window itself because this request's 500ms ack window
    // lapsed (an unloaded/crashed WebView) — the frontend must not keep
    // showing a confirmation dialog nobody can see.
    act(() => onFallbackHidden?.());

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('macOS Cmd-Q with nothing running quits at once, leaving the window hidden', async () => {
    isMacOS.mockReturnValue(true);
    renderTitleBar();

    await waitFor(() => expect(listenForQuitRequested).toHaveBeenCalledTimes(1));
    const onQuitRequested = listenForQuitRequested.mock.calls[0]?.[0];
    act(() => onQuitRequested?.(3));

    expect(ackQuitPromptShown).toHaveBeenCalledWith(3, false);
    await waitFor(() => expect(runDesktopWindowAction).toHaveBeenCalledWith('quit'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('macOS Cmd-Q confirms while a conversation is running, and quits only when confirmed', async () => {
    isMacOS.mockReturnValue(true);
    queryClient.setQueryData(
      ['sessions', 'http://127.0.0.1', 'family', 'run-1'],
      [
        { id: 'run-1', state: 'running' },
        { id: 'done-1', state: 'completed' },
      ],
    );
    renderTitleBar();

    await waitFor(() => expect(listenForQuitRequested).toHaveBeenCalledTimes(1));
    const onQuitRequested = listenForQuitRequested.mock.calls[0]?.[0];
    act(() => onQuitRequested?.(4));

    expect(ackQuitPromptShown).toHaveBeenCalledWith(4, true);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('1 conversation is still running.');
    expect(runDesktopWindowAction).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(runDesktopWindowAction).not.toHaveBeenCalled();

    act(() => onQuitRequested?.(5));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: `Quit ${brand.productName}`,
      }),
    );
    expect(runDesktopWindowAction).toHaveBeenCalledWith('quit');
  });

  it('routes overflow actions through the existing application workflows', async () => {
    const openSettings = vi.fn();
    renderTitleBar(<MenuWorkflows actions={{ 'open-settings': openSettings }} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open application menu' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /settings/i }));

    expect(openSettings).toHaveBeenCalledOnce();
  });

  it('groups the app menu like the macOS menu bar and runs the same workflows', async () => {
    const search = vi.fn();
    const connectByAddress = vi.fn();
    const installAgent = vi.fn();
    const keyboardShortcuts = vi.fn();
    renderTitleBar(
      <MenuWorkflows
        actions={{
          search,
          'connect-by-address': connectByAddress,
          'install-agent': installAgent,
          'keyboard-shortcuts': keyboardShortcuts,
        }}
      />,
    );
    const openMenu = async () => {
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Open application menu' }));
      return screen.findByRole('menu');
    };
    const openSubmenu = async (name: string) => {
      fireEvent.click(within(await openMenu()).getByRole('menuitem', { name }));
      return screen.findByRole('menu', { name });
    };

    const topLevel = within(await openMenu())
      .getAllByRole('menuitem')
      .map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(topLevel.slice(0, 5)).toEqual(['File', 'View', 'Agent', 'Window', 'Help']);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    fireEvent.click(within(await openSubmenu('View')).getByRole('menuitem', { name: /^search/i }));
    expect(search).toHaveBeenCalledOnce();

    // No screen hosts a workbench here, so its row can't pretend to work.
    expect(
      within(await openSubmenu('View')).getByRole('menuitem', { name: /workbench/i }),
    ).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(screen.getAllByRole('menu')[0] as HTMLElement, { key: 'Escape' });

    const agentRows = within(await openSubmenu('Agent'))
      .getAllByRole('menuitem')
      .map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(agentRows).toEqual([
      'Connection settings',
      'Switch to',
      'Manage agents',
      'Add an agent…',
      expect.stringMatching(/^Infrastructure/),
    ]);
    const openAddAgent = async () => {
      fireEvent.click(
        within(await openSubmenu('Agent')).getByRole('menuitem', { name: 'Add an agent…' }),
      );
      return screen.findByRole('menu', { name: 'Add an agent…' });
    };
    fireEvent.keyDown(screen.getAllByRole('menu')[0] as HTMLElement, { key: 'Escape' });
    fireEvent.click(
      within(await openAddAgent()).getByRole('menuitem', { name: /connect by address/i }),
    );
    expect(connectByAddress).toHaveBeenCalledOnce();
    fireEvent.click(
      within(await openAddAgent()).getByRole('menuitem', {
        name: `Install ${brand.agentName} on a computer`,
      }),
    );
    expect(installAgent).toHaveBeenCalledOnce();

    fireEvent.click(
      within(await openSubmenu('Help')).getByRole('menuitem', { name: /keyboard shortcuts/i }),
    );
    expect(keyboardShortcuts).toHaveBeenCalledOnce();

    fireEvent.click(
      within(await openSubmenu('Window')).getByRole('menuitem', { name: 'Minimize' }),
    );
    await waitFor(() => expect(runDesktopWindowAction).toHaveBeenCalledWith('minimize'));

    fireEvent.click(
      within(await openSubmenu('File')).getByRole('menuitem', { name: 'Close window' }),
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent(`Keep ${brand.productName} running?`);
    expect(runDesktopWindowAction).not.toHaveBeenCalledWith('hide');
  });

  it('switches to another saved agent from Agent › Switch to', async () => {
    renderTitleBar();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open application menu' }));
    fireEvent.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Agent' }),
    );
    fireEvent.click(
      within(await screen.findByRole('menu', { name: 'Agent' })).getByRole('menuitem', {
        name: 'Switch to',
      }),
    );
    const switchMenu = await screen.findByRole('menu', { name: 'Switch to' });
    const rows = within(switchMenu).getAllByRole('menuitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Aurora');
    fireEvent.click(rows[0] as HTMLElement);
    await waitFor(() =>
      expect(switchConnection).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'https://aurora.example:8787' }),
      ),
    );
  });

  it('opens the application menu on Alt+Space, same as the hamburger', () => {
    renderTitleBar();

    expect(screen.queryByRole('menuitem', { name: /settings/i })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { altKey: true, code: 'Space' });

    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
  });

  it('title_bar_shows_session_context: shows workspace › session with the agent badge once a route writes it', () => {
    useDesktopTitleStore.getState().setTitleContext({
      agent: 'EarthScope (Flat / Haiku)',
      session: 'NDP flatness run',
      workspace: 'flat-ndp',
    });
    renderTitleBar();

    expect(screen.getByText('flat-ndp')).toBeInTheDocument();
    expect(screen.getByText('NDP flatness run')).toBeInTheDocument();
    expect(screen.getByText('EarthScope (Flat / Haiku)')).toBeInTheDocument();
  });

  it('the title context region is a deep Tauri drag region, so clicking its text (not just its padding) drags', () => {
    useDesktopTitleStore.getState().setTitleContext({
      agent: 'EarthScope (Flat / Haiku)',
      session: 'NDP flatness run',
      workspace: 'flat-ndp',
    });
    renderTitleBar();

    expect(screen.getByTestId('desktop-title-context')).toHaveAttribute(
      'data-tauri-drag-region',
      'deep',
    );
  });

  it('double-clicking the title context no longer toggles maximize itself — Tauri handles it natively', () => {
    renderTitleBar();

    fireEvent.doubleClick(screen.getByTestId('desktop-title-context'));

    expect(runDesktopWindowAction).not.toHaveBeenCalledWith('toggleMaximize');
  });

  it('agent_badge_opens_agent: clicking the agent badge calls the route-supplied opener', () => {
    const onOpenAgent = vi.fn();
    useDesktopTitleStore.getState().setTitleContext({
      agent: 'EarthScope (Flat / Haiku)',
      onOpenAgent,
      session: 'NDP flatness run',
      workspace: 'flat-ndp',
    });
    renderTitleBar();

    fireEvent.click(screen.getByRole('button', { name: 'EarthScope (Flat / Haiku)' }));

    expect(onOpenAgent).toHaveBeenCalledOnce();
  });

  it('renders no agent badge while the route has not resolved the agent', () => {
    useDesktopTitleStore.getState().setTitleContext({
      session: 'NDP flatness run',
      workspace: 'flat-ndp',
    });
    renderTitleBar();

    const titleContext = within(screen.getByTestId('desktop-title-context'));
    expect(titleContext.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shortcuts_bind_new_session_fullscreen: Ctrl+N and F11 work on Windows/Linux; App owns Ctrl+comma', () => {
    const action = vi.fn();
    window.addEventListener(MENU_ACTION_EVENT, action);
    renderTitleBar();

    fireEvent.keyDown(window, { ctrlKey: true, key: 'n' });
    fireEvent.keyDown(window, { ctrlKey: true, key: ',' });
    fireEvent.keyDown(window, { key: 'F11' });

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ detail: 'new-session' }));
    expect(runDesktopWindowAction).toHaveBeenCalledWith('toggleFullscreen');
    window.removeEventListener(MENU_ACTION_EVENT, action);
  });

  it('shortcuts also answer to Cmd on macOS, where the hamburger shows ⌘ glyphs', async () => {
    isMacOS.mockReturnValue(true);
    const action = vi.fn();
    window.addEventListener(MENU_ACTION_EVENT, action);
    renderTitleBar();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open application menu' }));
    expect(await screen.findByRole('menuitem', { name: /settings/i })).toHaveTextContent('⌘,');
    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));
    expect(await screen.findByRole('menuitem', { name: /new conversation/i })).toHaveTextContent(
      '⌘N',
    );

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ detail: 'new-session' }));
    window.removeEventListener(MENU_ACTION_EVENT, action);
  });

  it('falls back to the product name on a route that never writes title context', () => {
    renderTitleBar();

    // The centre owns the route fallback; scope to
    // the centre context region specifically so this asserts its OWN
    // fallback, not the always-present left-section brand block.
    expect(
      within(screen.getByTestId('desktop-title-context')).getByText(brand.wordmark),
    ).toBeInTheDocument();
  });

  it('title_bar_shows_connection_state_with_tooltip: the health dot discloses endpoint, transport, and backend version on hover', async () => {
    liveStreamState.current = 'reconnecting';
    renderTitleBar();

    const dot = screen.getByRole('status', { name: 'Reconnecting' });
    // gact-tui rule: status is never encoded only as a dot/color/icon -- the
    // "Reconnecting" label itself must be real, visible text, not just an
    // aria-label with nothing on screen.
    expect(dot).toHaveTextContent('Reconnecting');
    fireEvent.pointerEnter(dot);
    fireEvent.focus(dot);

    expect(await screen.findByText('http://127.0.0.1')).toBeInTheDocument();
    expect(screen.getByText('Transport: Bridge')).toBeInTheDocument();
    expect(screen.getByText('Backend: clio-agent-gact 1.2.3')).toBeInTheDocument();
  });

  it('shows the backend as unknown until capabilities resolve', async () => {
    capabilitiesService.current = undefined;
    renderTitleBar();

    const dot = screen.getByRole('status', { name: 'Live' });
    fireEvent.pointerEnter(dot);
    fireEvent.focus(dot);

    expect(await screen.findByText('Backend: Unknown')).toBeInTheDocument();
  });

  it('window_controls_present_on_windows_linux_only: hides the custom window controls on macOS, where native traffic lights apply', () => {
    isMacOS.mockReturnValue(true);
    renderTitleBar();

    expect(screen.queryByRole('button', { name: 'Minimize' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maximize or restore' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    // The connection health indicator is not window chrome, so it still renders.
    expect(screen.getByRole('status', { name: 'Live' })).toBeInTheDocument();
  });

  it('shows the custom window controls on Windows/Linux', () => {
    isMacOS.mockReturnValue(false);
    renderTitleBar();

    expect(screen.getByRole('button', { name: 'Minimize' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maximize or restore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('centers the Live indicator on the same line as the breadcrumb and window controls', () => {
    isMacOS.mockReturnValue(false);
    renderTitleBar();

    const live = screen.getByRole('status', { name: 'Live' });
    const controls = live.parentElement;
    // The control group stretches its children to the bar height so the
    // window buttons fill it; the indicator must opt out and center itself,
    // or its chip top-aligns inside a bar-height box.
    expect(controls).toHaveClass('items-stretch');
    expect(live).toHaveClass('self-center', 'inline-flex', 'items-center');
    // The window buttons fill the bar and center their icon on its midline.
    expect(screen.getByRole('button', { name: 'Minimize' })).toHaveClass(
      'h-10',
      'place-items-center',
    );
    // The breadcrumb region centers its content on the same midline.
    expect(screen.getByLabelText(/desktop controls/)).toHaveClass('h-10', 'flex');
    expect(controls?.previousElementSibling).toHaveClass('items-center');
  });
});
