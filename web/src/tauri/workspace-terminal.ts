import { inTauri } from '@/lib/transport/tauri-runtime';

/** Open a native terminal rooted at an existing CLIO workspace. */
export async function openWorkspaceTerminal(path: string): Promise<string> {
  if (!inTauri()) {
    throw new Error('Workspace terminals are available in the installed desktop app.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('open_workspace_terminal', { path });
}

export interface OpenEmbeddedTerminalOptions {
  cwd: string;
  cols: number;
  rows: number;
  shell?: string;
}

interface TerminalOpenResult {
  id: number;
}

interface TerminalDataPayload {
  data: string;
}

interface TerminalExitPayload {
  code: number | null;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Open an embedded pty terminal rooted at `cwd`. Desktop (Tauri) only — the
 * `terminal_open`/`terminal_write`/`terminal_resize`/`terminal_close`
 * commands and the `clio:terminal-data:{id}` / `clio:terminal-exit:{id}`
 * events are all implemented in `desktop/src-tauri/src/terminal_pty.rs`.
 */
export async function openEmbeddedTerminal(options: OpenEmbeddedTerminalOptions): Promise<number> {
  if (!inTauri()) {
    throw new Error('The embedded terminal is available in the installed desktop app.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<TerminalOpenResult>('terminal_open', {
    cwd: options.cwd,
    cols: options.cols,
    rows: options.rows,
    shell: options.shell,
  });
  return result.id;
}

/** Write keystrokes (or pasted text) into an embedded terminal's pty. */
export async function writeEmbeddedTerminal(id: number, data: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('terminal_write', { id, data });
}

/** Resize an embedded terminal's pty to match its pane. */
export async function resizeEmbeddedTerminal(id: number, cols: number, rows: number): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('terminal_resize', { id, cols, rows });
}

/** Close an embedded terminal: kills its shell. Idempotent. */
export async function closeEmbeddedTerminal(id: number): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('terminal_close', { id });
}

/** Stream decoded pty output for one embedded terminal. */
export async function listenEmbeddedTerminalData(
  id: number,
  handler: (bytes: Uint8Array) => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<TerminalDataPayload>(`clio:terminal-data:${id}`, (event) => {
    handler(base64ToBytes(event.payload.data));
  });
}

/** Notified once when an embedded terminal's shell exits. */
export async function listenEmbeddedTerminalExit(
  id: number,
  handler: (code: number | null) => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<TerminalExitPayload>(`clio:terminal-exit:${id}`, (event) => {
    handler(event.payload.code);
  });
}

// Terminals opened per CLIO session, so a deleted session can be reaped even
// if its workbench tab was never explicitly closed first (the tab-close path
// already calls closeEmbeddedTerminal directly from the panel's own unmount
// cleanup — this covers the OTHER lifecycle event: the session itself going
// away while the tab is still open).
const terminalsBySession = new Map<string, Set<number>>();

export function trackEmbeddedTerminal(sessionId: string, id: number): void {
  const ids = terminalsBySession.get(sessionId) ?? new Set<number>();
  ids.add(id);
  terminalsBySession.set(sessionId, ids);
}

export function untrackEmbeddedTerminal(sessionId: string, id: number): void {
  const ids = terminalsBySession.get(sessionId);
  if (!ids) return;
  ids.delete(id);
  if (ids.size === 0) terminalsBySession.delete(sessionId);
}

/** Kill every embedded terminal tracked for `sessionId`. Best-effort: a pty
 * that already closed itself (tab close raced this) is not an error. */
export async function closeEmbeddedTerminalsForSession(sessionId: string): Promise<void> {
  const ids = terminalsBySession.get(sessionId);
  if (!ids || ids.size === 0) return;
  terminalsBySession.delete(sessionId);
  // Sequential, not Promise.all: there are only ever a handful of
  // terminals per session, and closing one at a time keeps each call
  // straightforward to reason about (and to test) without relying on
  // concurrent dynamic imports of the same bridge module resolving safely.
  for (const id of ids) {
    await closeEmbeddedTerminal(id).catch(() => undefined);
  }
}
