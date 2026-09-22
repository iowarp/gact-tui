import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import {
  closeEmbeddedTerminalTab,
  closeEmbeddedTerminalsForSession,
  ensureEmbeddedTerminal,
  getEmbeddedTerminal,
  openWorkspaceTerminal,
} from './workspace-terminal';

function resolvedUnlisten() {
  return Promise.resolve(() => undefined);
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.listen.mockReset();
  xterm.MockTerminal.instances = [];
  xterm.MockFitAddon.instances = [];
  Object.assign(window, { __TAURI_INTERNALS__: {} });
});

describe('openWorkspaceTerminal', () => {
  it('asks the native shell to open the exact workspace path', async () => {
    mocks.invoke.mockResolvedValue('C:\\science\\palm-springs');

    await expect(openWorkspaceTerminal('C:\\science\\palm-springs')).resolves.toBe(
      'C:\\science\\palm-springs',
    );
    expect(mocks.invoke).toHaveBeenCalledWith('open_workspace_terminal', {
      path: 'C:\\science\\palm-springs',
    });
  });
});

describe('ensureEmbeddedTerminal', () => {
  it('registers the data and exit listeners BEFORE invoking terminal_open', async () => {
    const order: string[] = [];
    mocks.listen.mockImplementation((event: string) => {
      order.push(`listen:${event}`);
      return resolvedUnlisten();
    });
    mocks.invoke.mockImplementation((command: string) => {
      order.push(`invoke:${command}`);
      return Promise.resolve(undefined);
    });

    const entry = ensureEmbeddedTerminal({
      tabId: 'tab-order',
      sessionId: 'sess_1',
      cwd: '/workspace/demo',
      cols: 80,
      rows: 24,
    });
    await entry.readyPromise;

    expect(order).toEqual([
      'listen:clio:terminal-data',
      'listen:clio:terminal-exit',
      'invoke:terminal_open',
    ]);
  });

  it('is idempotent: a second ensure for the same tab returns the same entry and never reopens', async () => {
    mocks.listen.mockImplementation(resolvedUnlisten);
    mocks.invoke.mockResolvedValue(undefined);

    const options = {
      tabId: 'tab-idempotent',
      sessionId: 'sess_1',
      cwd: '/workspace/demo',
      cols: 80,
      rows: 24,
    };
    const first = ensureEmbeddedTerminal(options);
    await first.readyPromise;
    const openCallsAfterFirst = mocks.invoke.mock.calls.filter(
      ([command]) => command === 'terminal_open',
    ).length;
    expect(openCallsAfterFirst).toBe(1);

    const second = ensureEmbeddedTerminal(options);

    expect(second).toBe(first);
    expect(second.term).toBe(first.term);
    expect(
      mocks.invoke.mock.calls.filter(([command]) => command === 'terminal_open').length,
    ).toBe(1);
  });
});

describe('closeEmbeddedTerminalTab', () => {
  it('invokes terminal_close, unlistens, disposes the terminal, and forgets the entry', async () => {
    const unlistenData = vi.fn();
    const unlistenExit = vi.fn();
    mocks.listen
      .mockImplementationOnce(() => Promise.resolve(unlistenData))
      .mockImplementationOnce(() => Promise.resolve(unlistenExit));
    mocks.invoke.mockResolvedValue(undefined);

    const entry = ensureEmbeddedTerminal({
      tabId: 'tab-close',
      sessionId: 'sess_1',
      cwd: '/workspace/demo',
      cols: 80,
      rows: 24,
    });
    await entry.readyPromise;

    await closeEmbeddedTerminalTab('tab-close');

    expect(unlistenData).toHaveBeenCalledTimes(1);
    expect(unlistenExit).toHaveBeenCalledTimes(1);
    expect(entry.term?.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith('terminal_close', { id: entry.id });
    expect(getEmbeddedTerminal('tab-close')).toBeUndefined();
  });

  it('unlistens correctly even when close races a still-pending listen', async () => {
    const dataUnlisten = vi.fn();
    let resolveDataListen: ((unlisten: () => void) => void) | undefined;
    mocks.listen.mockImplementationOnce(
      () =>
        new Promise<() => void>((resolve) => {
          resolveDataListen = resolve;
        }),
    );
    mocks.listen.mockImplementation(resolvedUnlisten);
    mocks.invoke.mockResolvedValue(undefined);

    ensureEmbeddedTerminal({
      tabId: 'tab-race',
      sessionId: 'sess_1',
      cwd: '/workspace/demo',
      cols: 80,
      rows: 24,
    });
    // Deliberately not awaited: close races the still-in-flight open.
    const closePromise = closeEmbeddedTerminalTab('tab-race');

    // The dynamic `import('@tauri-apps/api/event')` inside `listenTerminalData`
    // adds its own microtask hop before the mocked `listen()` is actually
    // invoked, so `resolveDataListen` is not set the instant `ensure`/`close`
    // return — wait for it rather than assuming it is already there.
    await vi.waitUntil(() => resolveDataListen !== undefined);
    resolveDataListen?.(dataUnlisten);
    await closePromise;

    expect(dataUnlisten).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for a tab with no tracked terminal', async () => {
    await expect(closeEmbeddedTerminalTab('tab-never-opened')).resolves.toBeUndefined();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});

describe('closeEmbeddedTerminalsForSession', () => {
  it('closes every terminal tab tracked for the session and leaves other sessions alone', async () => {
    mocks.listen.mockImplementation(resolvedUnlisten);
    mocks.invoke.mockResolvedValue(undefined);

    const a = ensureEmbeddedTerminal({
      tabId: 'terminal:sess_1',
      sessionId: 'sess_1',
      cwd: '/workspace/demo',
      cols: 80,
      rows: 24,
    });
    await a.readyPromise;
    const b = ensureEmbeddedTerminal({
      tabId: 'terminal:sess_2',
      sessionId: 'sess_2',
      cwd: '/workspace/demo',
      cols: 80,
      rows: 24,
    });
    await b.readyPromise;

    await closeEmbeddedTerminalsForSession('sess_1');

    expect(mocks.invoke).toHaveBeenCalledWith('terminal_close', { id: a.id });
    expect(mocks.invoke).not.toHaveBeenCalledWith('terminal_close', { id: b.id });
    expect(getEmbeddedTerminal('terminal:sess_1')).toBeUndefined();
    expect(getEmbeddedTerminal('terminal:sess_2')).toBeDefined();
  });

  it('is a no-op for a session with no tracked terminals', async () => {
    await closeEmbeddedTerminalsForSession('sess_never_opened');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
