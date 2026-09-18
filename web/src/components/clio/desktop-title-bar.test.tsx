import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MENU_ACTION_EVENT } from '@/tauri/menu-actions';
import { TooltipProvider } from '@/components/ui/tooltip';
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

vi.mock('@/tauri/desktop-window', () => ({
  runDesktopWindowAction,
  ackClosePromptShown,
}));

vi.mock('@/tauri/desktop-lifecycle', () => ({
  listenForCloseRequested,
  listenForCloseFallbackHidden,
}));

vi.mock('sonner', () => ({ toast: { error: toastError } }));

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
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  });

  it('stays out of the browser experience', () => {
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
});
