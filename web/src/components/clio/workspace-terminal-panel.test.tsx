import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));

const xterm = vi.hoisted(() => {
  class MockTerminal {
    static instances: MockTerminal[] = [];
    cols = 80;
    rows = 24;
    write = vi.fn();
    dispose = vi.fn();
    loadAddon = vi.fn();
    open = vi.fn();
    onData = vi.fn();
    constructor() {
      MockTerminal.instances.push(this);
    }
  }
  class MockFitAddon {
    static instances: MockFitAddon[] = [];
    fit = vi.fn();
    constructor() {
      MockFitAddon.instances.push(this);
    }
  }
  return { MockTerminal, MockFitAddon };
});

vi.mock('@xterm/xterm', () => ({ Terminal: xterm.MockTerminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: xterm.MockFitAddon }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

const resizeObserverMock = vi.hoisted(() => {
  class TestResizeObserver {
    static instances: TestResizeObserver[] = [];
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      TestResizeObserver.instances.push(this);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  return { TestResizeObserver };
});

import { WorkspaceTerminalPanel } from './workspace-terminal-panel';

type EventHandler = (event: { payload: unknown }) => void;

function setupListen(): Map<string, EventHandler> {
  const listeners = new Map<string, EventHandler>();
  mocks.listen.mockImplementation((event: string, handler: EventHandler) => {
    listeners.set(event, handler);
    return Promise.resolve(() => listeners.delete(event));
  });
  return listeners;
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.listen.mockReset();
  xterm.MockTerminal.instances = [];
  xterm.MockFitAddon.instances = [];
  resizeObserverMock.TestResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', resizeObserverMock.TestResizeObserver);
  Object.assign(window, { __TAURI_INTERNALS__: {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mockOpenResolves(id: number) {
  mocks.invoke.mockImplementation((command: string) => {
    if (command === 'terminal_open') return Promise.resolve({ id });
    return Promise.resolve(undefined);
  });
}

describe('WorkspaceTerminalPanel', () => {
  it('mounts xterm, opens a pty at cwd, and writes streamed data into it', async () => {
    mockOpenResolves(42);
    const listeners = setupListen();

    render(<WorkspaceTerminalPanel cwd="/workspace/demo" sessionId="sess_1" />);

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'terminal_open',
        expect.objectContaining({ cwd: '/workspace/demo' }),
      ),
    );
    await waitFor(() => expect(listeners.has('clio:terminal-data:42')).toBe(true));

    const term = xterm.MockTerminal.instances[0];
    expect(term.open).toHaveBeenCalled();

    const base64Hello = globalThis.btoa('hello');
    act(() => {
      listeners.get('clio:terminal-data:42')?.({ payload: { data: base64Hello } });
    });

    expect(term.write).toHaveBeenCalledTimes(1);
    const written = term.write.mock.calls[0][0] as Uint8Array;
    expect(new TextDecoder().decode(written)).toBe('hello');
  });

  it('closes the pty when the panel unmounts', async () => {
    mockOpenResolves(42);
    setupListen();

    const { unmount } = render(
      <WorkspaceTerminalPanel cwd="/workspace/demo" sessionId="sess_1" />,
    );

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'terminal_open',
        expect.objectContaining({ cwd: '/workspace/demo' }),
      ),
    );

    unmount();

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith('terminal_close', { id: 42 }),
    );
  });

  it('sends the terminal cols/rows on every observed resize', async () => {
    mockOpenResolves(42);
    setupListen();

    render(<WorkspaceTerminalPanel cwd="/workspace/demo" sessionId="sess_1" />);

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'terminal_open',
        expect.objectContaining({ cwd: '/workspace/demo' }),
      ),
    );
    await waitFor(() => expect(resizeObserverMock.TestResizeObserver.instances).toHaveLength(1));

    const term = xterm.MockTerminal.instances[0];
    term.cols = 120;
    term.rows = 40;
    const observer = resizeObserverMock.TestResizeObserver.instances[0];
    act(() => {
      observer.callback([], observer as unknown as ResizeObserver);
    });

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith('terminal_resize', {
        id: 42,
        cols: 120,
        rows: 40,
      }),
    );
    expect(xterm.MockFitAddon.instances[0].fit).toHaveBeenCalled();
  });

  it('shows a restart action once the shell exits', async () => {
    mockOpenResolves(42);
    const listeners = setupListen();

    render(<WorkspaceTerminalPanel cwd="/workspace/demo" sessionId="sess_1" />);

    await waitFor(() => expect(listeners.has('clio:terminal-exit:42')).toBe(true));

    act(() => {
      listeners.get('clio:terminal-exit:42')?.({ payload: { code: 1 } });
    });

    expect(await screen.findByText('Shell exited (code 1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restart/i })).toBeInTheDocument();
  });
});
