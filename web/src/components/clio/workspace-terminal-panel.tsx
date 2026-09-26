import { AlertCircleIcon } from 'lucide-react';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  attachEmbeddedTerminalContainer,
  ensureEmbeddedTerminal,
  fitEmbeddedTerminal,
  restartEmbeddedTerminalTab,
  subscribeEmbeddedTerminalStatus,
  type EmbeddedTerminalStatus,
} from '@/tauri/workspace-terminal';

export interface WorkspaceTerminalPanelProps {
  /** Identifies the owning workbench tab — the pty and its `Terminal`
   * instance are keyed on this, not on this component's own lifetime (see
   * `workspace-terminal.ts`), so a tab switch or the canvas collapsing
   * (both unmount this component) never kills a running job. */
  tabId: string;
  /** The workspace directory the shell opens in. */
  cwd: string;
  /** The CLIO session this terminal tab belongs to — used only to key the
   * "kill every terminal opened under this session" cleanup that runs when
   * the session itself is deleted (see `closeEmbeddedTerminalsForSession`
   * in `use-workspace-navigation-actions.ts`). */
  sessionId: string;
}

/** How long to wait after the LAST observed resize before re-fitting and
 * telling the pty — avoids spamming `terminal_resize` on every intermediate
 * frame of a drag. */
const RESIZE_DEBOUNCE_MS = 50;

/**
 * Hosts one embedded pty session (Tauri desktop only). The pty, the
 * `@xterm/xterm` instance, and its data/exit listeners are all owned by the
 * module-level registry in `workspace-terminal.ts` — this component only
 * attaches/detaches that persistent terminal to its own DOM container on
 * mount/unmount, so switching workbench tabs or collapsing the canvas
 * (both unmount this component) never interrupts a running job. The pty is
 * closed only by an explicit tab close or the owning session's deletion,
 * neither of which happens from inside this component.
 */
export function WorkspaceTerminalPanel({ tabId, cwd, sessionId }: WorkspaceTerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<EmbeddedTerminalStatus>({ kind: 'connecting' });

  useEffect(() => {
    ensureEmbeddedTerminal({ tabId, sessionId, cwd, cols: 80, rows: 24 });
    const unsubscribe = subscribeEmbeddedTerminalStatus(tabId, setStatus);
    const container = containerRef.current;
    if (container) attachEmbeddedTerminalContainer(tabId, container);
    return unsubscribe;
  }, [cwd, sessionId, tabId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let debounce: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => fitEmbeddedTerminal(tabId), RESIZE_DEBOUNCE_MS);
    });
    observer.observe(container);
    return () => {
      window.clearTimeout(debounce);
      observer.disconnect();
    };
  }, [tabId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div
        aria-label="Embedded terminal"
        className="min-h-0 flex-1 overflow-hidden p-2"
        ref={containerRef}
        role="region"
      />
      {status.kind === 'exited' ? (
        <div className="flex items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
          <span>Shell exited{status.code !== null ? ` (code ${status.code})` : ''}</span>
          <Button
            onClick={() => restartEmbeddedTerminalTab(tabId)}
            size="xs"
            variant="outline"
          >
            <RetryIcon aria-hidden="true" />
            Restart
          </Button>
        </div>
      ) : null}
      {status.kind === 'error' ? (
        <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-destructive">
          <AlertCircleIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{status.message}</span>
          <Button
            onClick={() => restartEmbeddedTerminalTab(tabId)}
            size="xs"
            variant="outline"
          >
            <RetryIcon aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
