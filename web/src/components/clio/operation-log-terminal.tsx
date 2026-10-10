import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';
import { TERMINAL_FONT_FAMILY, loadXterm } from '@/tauri/workspace-terminal';
import type { OperationLogEntry } from './operation-progress-model';

/** Lines the service itself wrote (reuse notes, step changes) stand apart from command output. */
const SERVICE_LINE = (text: string) => `\x1b[36m${text}\x1b[0m`;
const STDERR_LINE = (text: string) => `\x1b[33m${text}\x1b[0m`;

/**
 * A read-only terminal view of an operation's live log, built on the same
 * xterm module and look as the workspace terminal: command output keeps its
 * own colours and progress bars. Lines are written once, in event-id order.
 */
export function OperationLogTerminal({
  label,
  lines,
  gap = false,
}: {
  label: string;
  lines: OperationLogEntry[];
  gap?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<{ term: Terminal; fit: FitAddon } | undefined>(undefined);
  const written = useRef(0);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string>();

  useEffect(() => {
    let disposed = false;
    loadXterm()
      .then(({ Terminal: TerminalCtor, FitAddon: FitAddonCtor }) => {
        const container = containerRef.current;
        if (disposed || !container) return;
        const term = new TerminalCtor({
          convertEol: true,
          cursorBlink: false,
          disableStdin: true,
          fontFamily: TERMINAL_FONT_FAMILY,
          fontSize: 12,
          scrollback: 10_000,
        });
        const fit = new FitAddonCtor();
        term.loadAddon(fit);
        term.open(container);
        fit.fit();
        terminal.current = { term, fit };
        written.current = 0;
        setReady(true);
      })
      .catch((error: unknown) => {
        if (!disposed) setFailure(error instanceof Error ? error.message : String(error));
      });
    return () => {
      disposed = true;
      terminal.current?.term.dispose();
      terminal.current = undefined;
    };
  }, []);

  useEffect(() => {
    const term = terminal.current?.term;
    if (!ready || !term) return;
    for (const entry of lines) {
      if (entry.id <= written.current) continue;
      const text =
        entry.stream === 'clio'
          ? SERVICE_LINE(entry.line)
          : entry.stream === 'stderr'
            ? STDERR_LINE(entry.line)
            : entry.line;
      term.write(`${text}\r\n`);
      written.current = entry.id;
    }
  }, [lines, ready]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let debounce: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => terminal.current?.fit.fit(), 50);
    });
    observer.observe(container);
    return () => {
      window.clearTimeout(debounce);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-md border bg-zinc-950" data-slot="operation-log">
      {gap ? (
        <p className="border-b border-zinc-800 px-3 py-1.5 text-xs text-zinc-400">
          Earlier output is no longer kept by the service.
        </p>
      ) : null}
      {failure ? (
        <pre
          aria-label={label}
          className="clio-scrollbar max-h-80 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-5 text-zinc-200"
          role="log"
        >
          {lines.map((entry) => entry.line).join('\n')}
        </pre>
      ) : (
        <div
          aria-label={label}
          className="h-72 p-2"
          data-line-count={lines.length}
          ref={containerRef}
          role="log"
        />
      )}
    </div>
  );
}
