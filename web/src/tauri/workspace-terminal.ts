import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import { inTauri } from '@/lib/transport/tauri-runtime';

/** Open a native terminal rooted at an existing CLIO workspace. */
export async function openWorkspaceTerminal(path: string): Promise<string> {
  if (!inTauri()) {
    throw new Error('Workspace terminals are available in the installed desktop app.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('open_workspace_terminal', { path });
}

const TERMINAL_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace';

interface TerminalDataPayload {
  id: string;
  data: string;
}

interface TerminalExitPayload {
  id: string;
  code: number | null;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function generateTerminalId(): string {
  return `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface XtermModule {
  Terminal: typeof Terminal;
  FitAddon: typeof FitAddon;
}

// xterm.js is a ~330KB chunk that most sessions never touch — loaded only
// the first time a terminal tab actually opens, and cached (a shared
// promise, not re-imported per terminal) for every one after that.
let xtermModulePromise: Promise<XtermModule> | undefined;
function loadXterm(): Promise<XtermModule> {
  if (!xtermModulePromise) {
    xtermModulePromise = Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/xterm/css/xterm.css'),
    ]).then(([xtermModule, fitModule]) => ({
      Terminal: xtermModule.Terminal,
      FitAddon: fitModule.FitAddon,
    }));
  }
  return xtermModulePromise;
}

/**
 * Raw IPC bindings for one embedded pty, keyed by the CLIENT-supplied `id`
 * this module generates (see [`ensureEmbeddedTerminal`]) — never a
 * server-generated one. The `terminal_open`/`terminal_write`/
 * `terminal_resize`/`terminal_close` commands and the `clio:terminal-data`
 * / `clio:terminal-exit` events (both fixed, shared event names carrying
 * `id` in the payload — mirroring the `gact:sse` bridge's keyed channel)
 * are implemented in `desktop/src-tauri/src/terminal_pty.rs`.
 */
async function invokeTerminalOpen(id: string, cwd: string, cols: number, rows: number): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('terminal_open', { id, cwd, cols, rows });
}

async function invokeTerminalWrite(id: string, data: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('terminal_write', { id, data });
}

async function invokeTerminalResize(id: string, cols: number, rows: number): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('terminal_resize', { id, cols, rows });
}

async function invokeTerminalClose(id: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('terminal_close', { id });
}

async function listenTerminalData(id: string, handler: (bytes: Uint8Array) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<TerminalDataPayload>('clio:terminal-data', (event) => {
    if (event.payload.id !== id) return;
    handler(base64ToBytes(event.payload.data));
  });
}

async function listenTerminalExit(
  id: string,
  handler: (code: number | null) => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<TerminalExitPayload>('clio:terminal-exit', (event) => {
    if (event.payload.id !== id) return;
    handler(event.payload.code);
  });
}

export type EmbeddedTerminalStatus =
  | { kind: 'connecting' }
  | { kind: 'running' }
  | { kind: 'exited'; code: number | null }
  | { kind: 'error'; message: string };

interface EmbeddedTerminalEntry {
  tabId: string;
  sessionId: string;
  cwd: string;
  id: string;
  /** `undefined` until the lazily-loaded xterm chunk resolves and
   * constructs it — every accessor below checks for this. */
  term: Terminal | undefined;
  fitAddon: FitAddon | undefined;
  status: EmbeddedTerminalStatus;
  listeners: Set<(status: EmbeddedTerminalStatus) => void>;
  unlistenData?: () => void;
  unlistenExit?: () => void;
  /** Resolves once the current open attempt (load xterm, listen, invoke)
   * settles — awaited by `closeEmbeddedTerminalTab` so a close that races
   * a still-in-flight open always unlistens/disposes correctly instead of
   * racing partially-registered listeners. */
  readyPromise: Promise<void>;
}

// Module-level so a running job's PTY and its buffered scrollback survive a
// workbench tab switch or the canvas collapsing — both unmount the panel
// component (Radix `TabsContent` without `forceMount`, and the canvas's own
// visibility gate), which must NOT kill the terminal. Only an explicit tab
// close or the owning session's deletion does that.
const entriesByTabId = new Map<string, EmbeddedTerminalEntry>();

function setStatus(entry: EmbeddedTerminalEntry, status: EmbeddedTerminalStatus): void {
  entry.status = status;
  for (const listener of entry.listeners) listener(status);
}

/**
 * Loads xterm (cached after the first call) and constructs the `Terminal` +
 * `FitAddon` for `entry` if it does not have one yet — a restart reuses the
 * existing instance (and its scrollback) rather than rebuilding it. Returns
 * the terminal as a plain local, not read back off `entry.term`, so the
 * rest of the open sequence is statically known to have a real instance —
 * no `entry.term!` assertions needed.
 */
async function ensureTerm(entry: EmbeddedTerminalEntry): Promise<Terminal> {
  if (entry.term) return entry.term;
  const { Terminal: TerminalCtor, FitAddon: FitAddonCtor } = await loadXterm();
  const term = new TerminalCtor({
    cursorBlink: true,
    fontFamily: TERMINAL_FONT_FAMILY,
    fontSize: 13,
  });
  const fitAddon = new FitAddonCtor();
  term.loadAddon(fitAddon);
  term.onData((data) => {
    void invokeTerminalWrite(entry.id, data);
  });
  entry.term = term;
  entry.fitAddon = fitAddon;
  return term;
}

/** Loads/constructs the terminal (if needed) and opens the pty under
 * `entry.id`. Used both for the first-ever open and for a restart. */
async function openEntry(entry: EmbeddedTerminalEntry, cols: number, rows: number): Promise<void> {
  let term: Terminal;
  try {
    term = await ensureTerm(entry);
  } catch (error) {
    setStatus(entry, {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Could not load the terminal.',
    });
    return;
  }

  if (!inTauri()) {
    setStatus(entry, {
      kind: 'error',
      message: 'The embedded terminal is available in the installed desktop app.',
    });
    return;
  }
  try {
    // Listen BEFORE invoking open, so the shell's first prompt can never
    // race a not-yet-registered listener (mirrors `tauri-transport.ts`'s
    // `stream()`: `listen('gact:sse', …)` is awaited before
    // `invoke('gact_sse_open', …)`).
    entry.unlistenData = await listenTerminalData(entry.id, (bytes) => term.write(bytes));
    entry.unlistenExit = await listenTerminalExit(entry.id, (code) => {
      setStatus(entry, { kind: 'exited', code });
    });
    await invokeTerminalOpen(entry.id, entry.cwd, cols, rows);
    setStatus(entry, { kind: 'running' });
  } catch (error) {
    setStatus(entry, {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Could not open the terminal.',
    });
  }
}

export interface EnsureEmbeddedTerminalOptions {
  tabId: string;
  sessionId: string;
  cwd: string;
  cols: number;
  rows: number;
}

/**
 * Returns the terminal entry for `tabId`, creating (and opening) one if it
 * does not exist yet. Idempotent: a panel that mounts, unmounts, and
 * remounts for the SAME tab gets back the exact same `Terminal` instance
 * and never re-opens the pty.
 */
export function ensureEmbeddedTerminal(options: EnsureEmbeddedTerminalOptions): EmbeddedTerminalEntry {
  const existing = entriesByTabId.get(options.tabId);
  if (existing) return existing;

  const entry: EmbeddedTerminalEntry = {
    tabId: options.tabId,
    sessionId: options.sessionId,
    cwd: options.cwd,
    id: generateTerminalId(),
    term: undefined,
    fitAddon: undefined,
    status: { kind: 'connecting' },
    listeners: new Set(),
    readyPromise: Promise.resolve(),
  };
  // Inserted into the registry BEFORE any async work starts, so a second
  // `ensureEmbeddedTerminal` call for the same tab — even one that lands
  // before xterm has finished loading — sees this entry and returns it
  // instead of racing a duplicate pty open.
  entriesByTabId.set(options.tabId, entry);

  entry.readyPromise = openEntry(entry, options.cols, options.rows);
  return entry;
}

export function getEmbeddedTerminal(tabId: string): EmbeddedTerminalEntry | undefined {
  return entriesByTabId.get(tabId);
}

/**
 * Attaches `tabId`'s persistent `Terminal` to `container` (a fresh mount's
 * DOM node), once xterm has finished loading and constructing it.
 * `Terminal.open()` may only run once per instance, so a REMOUNT reparents
 * the existing `term.element` into the new container instead of calling
 * `open()` again.
 */
export function attachEmbeddedTerminalContainer(tabId: string, container: HTMLElement): void {
  const entry = entriesByTabId.get(tabId);
  if (!entry) return;
  void entry.readyPromise.then(() => {
    // The tab may have closed (or this container's own effect cleaned up)
    // while xterm was still loading — re-check before touching anything.
    if (entriesByTabId.get(tabId) !== entry || !entry.term || !entry.fitAddon) return;
    if (entry.term.element) {
      container.appendChild(entry.term.element);
    } else {
      entry.term.open(container);
    }
    entry.fitAddon.fit();
  });
}

/** Subscribes to status changes for `tabId`, immediately replaying the
 * current status so a panel that attaches after the pty already opened (or
 * already exited) does not miss it. */
export function subscribeEmbeddedTerminalStatus(
  tabId: string,
  listener: (status: EmbeddedTerminalStatus) => void,
): () => void {
  const entry = entriesByTabId.get(tabId);
  if (!entry) return () => undefined;
  entry.listeners.add(listener);
  listener(entry.status);
  return () => entry.listeners.delete(listener);
}

/** Re-fits the terminal to its current container and pushes the new
 * cols/rows to the pty. Call from a (debounced) `ResizeObserver`. */
export function fitEmbeddedTerminal(tabId: string): void {
  const entry = entriesByTabId.get(tabId);
  if (!entry || !entry.term || !entry.fitAddon) return;
  entry.fitAddon.fit();
  void invokeTerminalResize(entry.id, entry.term.cols, entry.term.rows);
}

/** Re-opens a fresh pty for a terminal whose shell exited, reusing the
 * same `Terminal` instance (and its scrollback). */
export function restartEmbeddedTerminalTab(tabId: string): void {
  const entry = entriesByTabId.get(tabId);
  if (!entry) return;
  entry.unlistenData?.();
  entry.unlistenExit?.();
  entry.unlistenData = undefined;
  entry.unlistenExit = undefined;
  entry.id = generateTerminalId();
  setStatus(entry, { kind: 'connecting' });
  const { cols, rows } = entry.term ?? { cols: 80, rows: 24 };
  // `openEntry` reuses `entry.term` (via `ensureTerm`) when it already
  // exists — a restart never rebuilds the `Terminal` instance or loses its
  // scrollback, only the pty underneath it is fresh.
  entry.readyPromise = openEntry(entry, cols, rows);
}

/** Closes a terminal tab for good: kills its pty, unlistens, and disposes
 * its `Terminal` instance. The only two callers are an explicit tab close
 * and a deleted session ([`closeEmbeddedTerminalsForSession`]) — a panel
 * unmount from a tab switch or the canvas collapsing must never call this. */
export async function closeEmbeddedTerminalTab(tabId: string): Promise<void> {
  const entry = entriesByTabId.get(tabId);
  if (!entry) return;
  entriesByTabId.delete(tabId);
  // Awaiting first (even on a mid-flight open) guarantees the listeners
  // below are whatever `openEntry` last set them to, so a close that races
  // a pending `listen()` still unlistens correctly instead of leaking it.
  await entry.readyPromise.catch(() => undefined);
  entry.unlistenData?.();
  entry.unlistenExit?.();
  entry.term?.dispose();
  await invokeTerminalClose(entry.id).catch(() => undefined);
}

/** Kill every embedded terminal tab tracked for `sessionId`. Best-effort: a
 * pty that already closed itself (tab close raced this) is not an error. */
export async function closeEmbeddedTerminalsForSession(sessionId: string): Promise<void> {
  const tabIds = Array.from(entriesByTabId.values())
    .filter((entry) => entry.sessionId === sessionId)
    .map((entry) => entry.tabId);
  // Sequential, not Promise.all: only ever a handful of terminals per
  // session, and closing one at a time keeps each call straightforward to
  // reason about (and to test) without relying on concurrent dynamic
  // imports of the same bridge module resolving safely.
  for (const tabId of tabIds) {
    await closeEmbeddedTerminalTab(tabId).catch(() => undefined);
  }
}
