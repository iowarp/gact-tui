import { clearDesktopHost, mockDesktopHost } from '@/test/desktop-host';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StreamState } from '@clio/core/v3';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { brand } from '@brand';
import { MENU_ACTION_EVENT, useMenuAction, type MenuAction } from '@/tauri/menu-actions';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { KeyPlatformContext } from '@/lib/shortcuts/hooks';
import type { KeyPlatform } from '@/lib/shortcuts/keys';
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
const isWindows = vi.hoisted(() => vi.fn(() => false));
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

vi.mock('@/lib/platform', () => ({ isMacOS, isWindows }));

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
  // The page detects its key platform once, so a test that switches platform names it.
  const renderTitleBar = (workflows?: ReactNode, keyPlatform: KeyPlatform | null = null) =>
    render(
      <QueryClientProvider client={queryClient}>
        <KeyPlatformContext.Provider value={keyPlatform}>
          <TooltipProvider>
            {workflows}
            <DesktopTitleBar />
          </TooltipProvider>
        </KeyPlatformContext.Provider>
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

  it.each([
    ['Linux', false, false, 'in the system tray, if your desktop shows one', true],
    ['Windows', false, true, 'in the system tray (hidden icons)', false],
  ])('the close prompt names where %s keeps it running', (_os, mac, win, where, reopen) => {
    // Live (Linux Desktop 0.9.6.6): the prompt said "(Windows hidden icons)" on Linux,
    // where many desktops show no tray; opening the app again brings the window back.
    isMacOS.mockReturnValue(mac);
    isWindows.mockReturnValue(win);
    try {
      renderTitleBar();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      const prompt = screen.getByRole('alertdialog');
      expect(prompt).toHaveTextContent(`available ${where}, or quit`);
      expect(prompt.textContent ?? '').not.toMatch(win ? /Linux/u : /Windows/u);
      expect(prompt.textContent?.includes('again brings this window back')).toBe(reopen);
    } finally {
      isMacOS.mockReturnValue(false);
      isWindows.mockReturnValue(false);
    }
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

  it('the empty top-bar space is a deep Tauri drag region', () => {
    renderTitleBar();

    expect(screen.getByTestId('desktop-title-drag')).toHaveAttribute(
      'data-tauri-drag-region',
      'deep',
    );
  });

  it('double-clicking the drag region no longer toggles maximize itself — Tauri handles it natively', () => {
    renderTitleBar();

    fireEvent.doubleClick(screen.getByTestId('desktop-title-drag'));

    expect(runDesktopWindowAction).not.toHaveBeenCalledWith('toggleMaximize');
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
    renderTitleBar(undefined, 'mac');

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

  it('window_controls_present_on_windows_linux_only: hides the custom window controls on macOS, where native traffic lights apply', () => {
    isMacOS.mockReturnValue(true);
    renderTitleBar();

    expect(screen.queryByRole('button', { name: 'Minimize' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maximize or restore' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('shows the custom window controls on Windows/Linux', () => {
    isMacOS.mockReturnValue(false);
    renderTitleBar();

    expect(screen.getByRole('button', { name: 'Minimize' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maximize or restore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
