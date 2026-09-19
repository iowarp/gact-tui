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
    element: HTMLDivElement | undefined;
    write = vi.fn();
    dispose = vi.fn();
    loadAddon = vi.fn();
    onData = vi.fn();
    open = vi.fn((container: HTMLElement) => {
      this.element = document.createElement('div');
      container.appendChild(this.element);
    });
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
import { getEmbeddedTerminal } from '@/tauri/workspace-terminal';

type EventHandler = (event: { payload: { id: string; data?: string; code?: number | null } }) => void;

function setupListen(): Map<string, EventHandler> {
  const listeners = new Map<string, EventHandler>();
  mocks.listen.mockImplementation((event: string, handler: EventHandler) => {
    listeners.set(event, handler);
    return Promise.resolve(() => listeners.delete(event));
  });
  return listeners;
}

function mockInvokeOpenResolves() {
  mocks.invoke.mockResolvedValue(undefined);
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

describe('WorkspaceTerminalPanel', () => {
  it('mounts xterm, opens a pty at cwd, and writes streamed data into it', async () => {
    mockInvokeOpenResolves();
    const listeners = setupListen();

    render(<WorkspaceTerminalPanel cwd="/workspace/demo" sessionId="sess_1" tabId="tab-1" />);

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'terminal_open',
        expect.objectContaining({ cwd: '/workspace/demo' }),
      ),
    );
    await waitFor(() => expect(listeners.has('clio:terminal-data')).toBe(true));

    const term = xterm.MockTerminal.instances[0];
    expect(term.open).toHaveBeenCalledTimes(1);

    const entry = getEmbeddedTerminal('tab-1');
    expect(entry).toBeDefined();
    act(() => {
      listeners.get('clio:terminal-data')?.({
        payload: { id: entry!.id, data: globalThis.btoa('hello') },
      });
    });

    expect(term.write).toHaveBeenCalledTimes(1);
    const written = term.write.mock.calls[0][0] as Uint8Array;
    expect(new TextDecoder().decode(written)).toBe('hello');
  });

  it('mount, unmount, and remount preserves the pty and reattaches the same xterm instance', async () => {
    mockInvokeOpenResolves();
    setupListen();

    const { unmount } = render(
      <WorkspaceTerminalPanel cwd="/workspace/demo" sessionId="sess_1" tabId="tab-2" />,
    );
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'terminal_open',
        expect.objectContaining({ cwd: '/workspace/demo' }),
      ),
    );

    const entryBefore = getEmbeddedTerminal('tab-2');
    const firstTerm = xterm.MockTerminal.instances[0];
    expect(entryBefore?.term).toBe(firstTerm);

    // A tab switch or the canvas collapsing unmounts this component exactly
    // like this — it must never tear down the pty.
    unmount();

    expect(mocks.invoke).not.toHaveBeenCalledWith('terminal_close', expect.anything());
    expect(getEmbeddedTerminal('tab-2')).toBe(entryBefore);

    render(<WorkspaceTerminalPanel cwd="/workspace/demo" sessionId="sess_1" tabId="tab-2" />);

    // Still exactly one Terminal instance ever constructed, and it was
    // opened only once — remount reused it instead of opening a second pty.
    expect(xterm.MockTerminal.instances).toHaveLength(1);
    expect(getEmbeddedTerminal('tab-2')?.term).toBe(firstTerm);
    expect(firstTerm.open).toHaveBeenCalledTimes(1);
    expect(
      mocks.invoke.mock.calls.filter(([command]) => command === 'terminal_open').length,
    ).toBe(1);
    expect(mocks.invoke).not.toHaveBeenCalledWith('terminal_close', expect.anything());
  });

  it('debounces resize and sends the settled cols/rows once', async () => {
    mockInvokeOpenResolves();
    setupListen();

    render(<WorkspaceTerminalPanel cwd="/workspace/demo" sessionId="sess_1" tabId="tab-3" />);

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

    // Simulate a drag: several observed resizes in quick succession must
    // collapse into a single `terminal_resize` call once things settle.
    act(() => {
      observer.callback([], observer as unknown as ResizeObserver);
      observer.callback([], observer as unknown as ResizeObserver);
      observer.callback([], observer as unknown as ResizeObserver);
    });

    expect(mocks.invoke).not.toHaveBeenCalledWith('terminal_resize', expect.anything());

    await new Promise((resolve) => setTimeout(resolve, 80));

    const entry = getEmbeddedTerminal('tab-3');
    expect(mocks.invoke).toHaveBeenCalledWith('terminal_resize', {
      id: entry?.id,
      cols: 120,
      rows: 40,
    });
    expect(
      mocks.invoke.mock.calls.filter(([command]) => command === 'terminal_resize').length,
    ).toBe(1);
  });

  it('shows a restart action once the shell exits', async () => {
    mockInvokeOpenResolves();
    const listeners = setupListen();

    render(<WorkspaceTerminalPanel cwd="/workspace/demo" sessionId="sess_1" tabId="tab-4" />);

    await waitFor(() => expect(listeners.has('clio:terminal-exit')).toBe(true));

    const entry = getEmbeddedTerminal('tab-4');
    act(() => {
      listeners.get('clio:terminal-exit')?.({ payload: { id: entry!.id, code: 1 } });
    });

    expect(await screen.findByText('Shell exited (code 1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restart/i })).toBeInTheDocument();
  });
});
