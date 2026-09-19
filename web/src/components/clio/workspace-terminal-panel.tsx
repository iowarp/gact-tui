import { AlertCircleIcon, RotateCcwIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  closeEmbeddedTerminal,
  listenEmbeddedTerminalData,
  listenEmbeddedTerminalExit,
  openEmbeddedTerminal,
  resizeEmbeddedTerminal,
  trackEmbeddedTerminal,
  untrackEmbeddedTerminal,
  writeEmbeddedTerminal,
} from '@/tauri/workspace-terminal';
import '@xterm/xterm/css/xterm.css';

export interface WorkspaceTerminalPanelProps {
  /** The workspace directory the shell opens in. */
  cwd: string;
  /** The CLIO session this terminal tab belongs to — used only to key the
   * "kill every terminal opened under this session" cleanup that runs when
   * the session itself is deleted (see `closeEmbeddedTerminalsForSession`
   * in `use-workspace-navigation-actions.ts`). */
  sessionId: string;
}

type PanelStatus = 'connecting' | 'running' | 'exited' | 'error';

const TERMINAL_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace';

/**
 * Hosts one embedded pty session (Tauri desktop only). Mounts `@xterm/xterm`
 * into `containerRef`, opens a pty rooted at `cwd` via the `terminal_pty.rs`
 * commands, streams its output in, forwards keystrokes out, and keeps the
 * pty's size in sync with the pane through a `ResizeObserver` + the fit
 * addon. The pty is closed whenever this panel unmounts (tab close) — see
 * `closeEmbeddedTerminalsForSession` for the other teardown path (the
 * session itself being deleted while the tab stays open).
 */
export function WorkspaceTerminalPanel({ cwd, sessionId }: WorkspaceTerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<PanelStatus>('connecting');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  // Bumping this remounts the effect below, opening a fresh pty — the
  // "Restart"/"Retry" action after an exit or a failed open.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let unlistenData: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let terminalId: number | undefined;
    let term: import('@xterm/xterm').Terminal | undefined;

    setStatus('connecting');
    setError(undefined);
    setExitCode(null);

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      if (disposed) return;

      const instance = new Terminal({
        cursorBlink: true,
        fontFamily: TERMINAL_FONT_FAMILY,
        fontSize: 13,
      });
      const fitAddon = new FitAddon();
      instance.loadAddon(fitAddon);
      instance.open(container);
      fitAddon.fit();
      term = instance;

      try {
        const id = await openEmbeddedTerminal({ cwd, cols: instance.cols, rows: instance.rows });
        if (disposed) {
          void closeEmbeddedTerminal(id);
          return;
        }
        terminalId = id;
        trackEmbeddedTerminal(sessionId, id);
        setStatus('running');

        unlistenData = await listenEmbeddedTerminalData(id, (bytes) => {
          instance.write(bytes);
        });
        unlistenExit = await listenEmbeddedTerminalExit(id, (code) => {
          setStatus('exited');
          setExitCode(code);
        });

        instance.onData((data) => {
          void writeEmbeddedTerminal(id, data);
        });

        resizeObserver = new ResizeObserver(() => {
          fitAddon.fit();
          if (terminalId !== undefined) {
            void resizeEmbeddedTerminal(terminalId, instance.cols, instance.rows);
          }
        });
        resizeObserver.observe(container);
      } catch (caught) {
        if (disposed) return;
        setStatus('error');
        setError(caught instanceof Error ? caught.message : 'Could not open the terminal.');
      }
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      unlistenData?.();
      unlistenExit?.();
      term?.dispose();
      if (terminalId !== undefined) {
        untrackEmbeddedTerminal(sessionId, terminalId);
        void closeEmbeddedTerminal(terminalId);
      }
    };
  }, [attempt, cwd, sessionId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div className="min-h-0 flex-1 overflow-hidden p-2" ref={containerRef} />
      {status === 'exited' ? (
        <div className="flex items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
          <span>Shell exited{exitCode !== null ? ` (code ${exitCode})` : ''}</span>
          <Button onClick={() => setAttempt((value) => value + 1)} size="xs" variant="outline">
            <RotateCcwIcon aria-hidden="true" />
            Restart
          </Button>
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-destructive">
          <AlertCircleIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{error}</span>
          <Button onClick={() => setAttempt((value) => value + 1)} size="xs" variant="outline">
            <RotateCcwIcon aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
