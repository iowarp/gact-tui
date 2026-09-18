import type { StreamState } from '@clio/core/v3';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { brand } from '@brand';
import { MENU_ACTION_EVENT } from '@/tauri/menu-actions';
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
const toastError = vi.hoisted(() => vi.fn());
const isMacOS = vi.hoisted(() => vi.fn(() => false));
const liveStreamState = vi.hoisted(() => ({ current: 'live' as StreamState }));
const capabilitiesService = vi.hoisted(() => ({
  current: { name: 'clio-agent-gact', version: '1.2.3' } as { name: string; version: string } | undefined,
}));

vi.mock('@/tauri/desktop-window', () => ({
  runDesktopWindowAction,
  ackClosePromptShown,
}));

vi.mock('@/tauri/desktop-lifecycle', () => ({
  listenForCloseRequested,
  listenForCloseFallbackHidden,
}));

vi.mock('sonner', () => ({ toast: { error: toastError } }));

vi.mock('@/lib/platform', () => ({ isMacOS }));

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

vi.mock('@/hooks/use-workspace-capabilities', () => ({
  useWorkspaceCapabilities: () => ({
    capabilities: { data: { service: capabilitiesService.current } },
  }),
}));

vi.mock('@/store/live-store', () => ({
  useLiveStore: (selector: (state: { entities: { stream: string } }) => unknown) =>
    selector({ entities: { stream: liveStreamState.current } }),
}));

describe('DesktopTitleBar', () => {
  const renderTitleBar = () =>
    render(
      <TooltipProvider>
        <DesktopTitleBar />
      </TooltipProvider>,
    );

  beforeEach(() => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    runDesktopWindowAction.mockClear();
    ackClosePromptShown.mockClear();
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
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  });

  it('title_bar_hidden_in_browser: stays out of the browser experience', () => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
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

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Keep CLIO running?');
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
    fireEvent.click(screen.getByRole('button', { name: 'Quit CLIO' }));

    await waitFor(() => expect(runDesktopWindowAction).toHaveBeenCalledWith('quit'));
  });

  it('quit_invokes_quit_clio_without_toast_on_rejection: a rejected quit invoke never toasts', async () => {
    runDesktopWindowAction.mockRejectedValueOnce(new Error('teardown already unwound the WebView'));
    renderTitleBar();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quit CLIO' }));

    await waitFor(() => expect(runDesktopWindowAction).toHaveBeenCalledWith('quit'));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a rejected non-quit action still toasts', async () => {
    runDesktopWindowAction.mockRejectedValueOnce(new Error('boom'));
    renderTitleBar();

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining('could not update the desktop window')));
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

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Keep CLIO running?');
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

  it('routes overflow actions through the existing application workflows', async () => {
    const action = vi.fn();
    window.addEventListener(MENU_ACTION_EVENT, action);
    renderTitleBar();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open application menu' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /settings/i }));

    expect(action).toHaveBeenCalledOnce();
    const dispatchedEvent = action.mock.calls[0]?.[0];
    expect(dispatchedEvent).toBeDefined();
    expect((dispatchedEvent as CustomEvent).detail).toBe('open-settings');
    window.removeEventListener(MENU_ACTION_EVENT, action);
  });

  it('opens the application menu on Alt+Space, same as the hamburger', () => {
    renderTitleBar();

    expect(screen.queryByRole('menuitem', { name: /settings/i })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { altKey: true, code: 'Space' });

    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
  });

  it('title_bar_shows_session_context: shows workspace › session with the blueprint badge once a route writes it', () => {
    useDesktopTitleStore.getState().setTitleContext({
      blueprint: 'EarthScope (Flat / Haiku)',
      session: 'NDP flatness run',
      workspace: 'flat-ndp',
    });
    renderTitleBar();

    expect(screen.getByText('flat-ndp')).toBeInTheDocument();
    expect(screen.getByText('NDP flatness run')).toBeInTheDocument();
    expect(screen.getByText('EarthScope (Flat / Haiku)')).toBeInTheDocument();
  });

  it('falls back to the product name on a route that never writes title context', () => {
    renderTitleBar();

    // The left section always carries the brand mark + wordmark; scope to
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
    fireEvent.pointerEnter(dot);
    fireEvent.focus(dot);

    expect(await screen.findByText('http://127.0.0.1:8787')).toBeInTheDocument();
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
});
