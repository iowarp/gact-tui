import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));

import {
  closeEmbeddedTerminal,
  closeEmbeddedTerminalsForSession,
  listenEmbeddedTerminalData,
  listenEmbeddedTerminalExit,
  openEmbeddedTerminal,
  openWorkspaceTerminal,
  resizeEmbeddedTerminal,
  trackEmbeddedTerminal,
  writeEmbeddedTerminal,
} from './workspace-terminal';

describe('openWorkspaceTerminal', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.listen.mockReset();
    Object.assign(window, { __TAURI_INTERNALS__: {} });
  });

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

describe('embedded terminal bindings', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.listen.mockReset();
    Object.assign(window, { __TAURI_INTERNALS__: {} });
  });

  it('opens a pty rooted at cwd and returns its id', async () => {
    mocks.invoke.mockResolvedValue({ id: 7 });

    await expect(
      openEmbeddedTerminal({ cwd: 'C:\\workspace', cols: 80, rows: 24 }),
    ).resolves.toBe(7);
    expect(mocks.invoke).toHaveBeenCalledWith('terminal_open', {
      cwd: 'C:\\workspace',
      cols: 80,
      rows: 24,
      shell: undefined,
    });
  });

  it('rejects opening outside Tauri', async () => {
    Object.assign(window, { __TAURI_INTERNALS__: undefined, isTauri: undefined });
    await expect(
      openEmbeddedTerminal({ cwd: 'C:\\workspace', cols: 80, rows: 24 }),
    ).rejects.toThrow(/installed desktop app/);
  });

  it('writes keystrokes to the given terminal id', async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await writeEmbeddedTerminal(7, 'echo hi\r');
    expect(mocks.invoke).toHaveBeenCalledWith('terminal_write', { id: 7, data: 'echo hi\r' });
  });

  it('resizes the given terminal id', async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await resizeEmbeddedTerminal(7, 120, 40);
    expect(mocks.invoke).toHaveBeenCalledWith('terminal_resize', { id: 7, cols: 120, rows: 40 });
  });

  it('closes the given terminal id', async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await closeEmbeddedTerminal(7);
    expect(mocks.invoke).toHaveBeenCalledWith('terminal_close', { id: 7 });
  });

  it('decodes base64 data events for the exact per-id event name', async () => {
    let handler: ((event: { payload: { data: string } }) => void) | undefined;
    mocks.listen.mockImplementation((_event: string, cb: typeof handler) => {
      handler = cb;
      return Promise.resolve(() => undefined);
    });

    const received: Uint8Array[] = [];
    await listenEmbeddedTerminalData(7, (bytes) => received.push(bytes));

    expect(mocks.listen).toHaveBeenCalledWith('clio:terminal-data:7', expect.any(Function));
    handler?.({ payload: { data: globalThis.btoa('hello') } });
    expect(received).toHaveLength(1);
    expect(new TextDecoder().decode(received[0])).toBe('hello');
  });

  it('notifies exit with the shell exit code for the exact per-id event name', async () => {
    let handler: ((event: { payload: { code: number | null } }) => void) | undefined;
    mocks.listen.mockImplementation((_event: string, cb: typeof handler) => {
      handler = cb;
      return Promise.resolve(() => undefined);
    });

    const codes: Array<number | null> = [];
    await listenEmbeddedTerminalExit(7, (code) => codes.push(code));

    expect(mocks.listen).toHaveBeenCalledWith('clio:terminal-exit:7', expect.any(Function));
    handler?.({ payload: { code: 1 } });
    expect(codes).toEqual([1]);
  });
});

describe('closeEmbeddedTerminalsForSession', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue(undefined);
    mocks.listen.mockReset();
    Object.assign(window, { __TAURI_INTERNALS__: {} });
  });

  it('closes every terminal id tracked for the session and forgets them', async () => {
    trackEmbeddedTerminal('sess_1', 7);
    trackEmbeddedTerminal('sess_1', 8);
    trackEmbeddedTerminal('sess_2', 9);

    await closeEmbeddedTerminalsForSession('sess_1');

    expect(mocks.invoke).toHaveBeenCalledWith('terminal_close', { id: 7 });
    expect(mocks.invoke).toHaveBeenCalledWith('terminal_close', { id: 8 });
    expect(mocks.invoke).not.toHaveBeenCalledWith('terminal_close', { id: 9 });

    // A repeat call for the same session (e.g. a second delete attempt) is
    // a harmless no-op — nothing left to close.
    mocks.invoke.mockClear();
    await closeEmbeddedTerminalsForSession('sess_1');
    expect(mocks.invoke).not.toHaveBeenCalled();

    await closeEmbeddedTerminalsForSession('sess_2');
    expect(mocks.invoke).toHaveBeenCalledWith('terminal_close', { id: 9 });
  });

  it('is a no-op for a session with no tracked terminals', async () => {
    await closeEmbeddedTerminalsForSession('sess_never_opened');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
