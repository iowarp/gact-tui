import {
  AlertCircleIcon,
  DownloadIcon,
  EraserIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  LinkIcon,
  SquareTerminalIcon,
} from 'lucide-react';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { useContext, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { copyText } from '@/lib/clipboard';
import {
  attachEmbeddedTerminalContainer,
  ensureEmbeddedTerminal,
  fitEmbeddedTerminal,
  getEmbeddedTerminal,
  restartEmbeddedTerminalTab,
  subscribeEmbeddedTerminalStatus,
  type EmbeddedTerminalStatus,
} from '@/tauri/workspace-terminal';
import { FrameCommentsUnavailable } from './comments/frame-comments';
import { FrameTalkTake } from './file-viewer-take';
import { attempt, type CopyTake, type OpenTake } from './file-viewer-take-hooks';
import { PresentationNavigation } from './presentation-navigation';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { IconButton } from './primitives/icon-button';
import { downloadBytes } from './surface-export';

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

  const navigation = useContext(PresentationNavigation);
  const openFolder = navigation?.onOpenFolder;
  const folder =
    cwd
      .split(/[\\/]+/u)
      .filter(Boolean)
      .at(-1) ?? cwd;
  const output = () => {
    const text = terminalText(tabId);
    if (text === undefined) throw new Error('The terminal has not started yet.');
    return text;
  };
  const copyOutput = () =>
    void attempt(async () => copyText(output()), 'Copied the terminal output.');
  const openOutput = () => {
    const tab = window.open('about:blank', '_blank');
    void attempt(async () => {
      if (!tab) throw new Error('The browser blocked the new tab.');
      tab.opener = null;
      const url = URL.createObjectURL(new Blob([output()], { type: 'text/plain' }));
      tab.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  };
  const copy: CopyTake = {
    face: { label: 'Copy output', run: copyOutput },
    rows: [
      {
        id: 'contents',
        label: 'Contents',
        icon: <FileTextIcon />,
        accelerator: 'C',
        onSelect: copyOutput,
      },
      {
        id: 'absolute',
        label: 'Absolute path',
        icon: <LinkIcon />,
        accelerator: 'A',
        onSelect: () => void attempt(() => copyText(cwd), 'Copied the working folder.'),
      },
    ],
  };
  const open: OpenTake = {
    face: {
      label: 'Open the output in a browser tab',
      run: openOutput,
      icon: <ExternalLinkIcon aria-hidden="true" />,
    },
    busy: false,
    rows: [
      {
        id: 'browser',
        label: 'In a browser tab',
        icon: <GlobeIcon />,
        accelerator: 'B',
        onSelect: openOutput,
      },
      {
        id: 'download',
        label: 'Download',
        icon: <DownloadIcon />,
        accelerator: 'D',
        separatorBefore: true,
        onSelect: () =>
          void attempt(async () =>
            downloadBytes(
              new TextEncoder().encode(output()),
              'text/plain',
              `${folder}-terminal.txt`,
            ),
          ),
      },
    ],
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <TooltipProvider delayDuration={200}>
        <FrameBar
          label="Terminal"
          where={
            <span className="flex min-w-0 items-center gap-1.5">
              <SquareTerminalIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <FrameCrumbs
                parts={[
                  { label: folder, onSelect: openFolder ? () => openFolder('') : undefined },
                  { label: 'Terminal' },
                ]}
              />
            </span>
          }
          what={<span>{terminalStatusLabel(status)}</span>}
          format={
            <>
              <IconButton
                label="Restart the shell"
                icon={<RetryIcon aria-hidden="true" />}
                className="[&_svg]:size-3.5"
                onClick={() => restartEmbeddedTerminalTab(tabId)}
              />
              <IconButton
                label="Clear the terminal"
                icon={<EraserIcon aria-hidden="true" />}
                disabledReason={status.kind === 'running' ? undefined : 'The shell is not running'}
                className="[&_svg]:size-3.5"
                onClick={() => getEmbeddedTerminal(tabId)?.term?.clear()}
              />
            </>
          }
          actions={
            <FrameTalkTake
              addToMessage={{ reason: 'Terminal output is not a file', onSelect: () => undefined }}
              comments={<FrameCommentsUnavailable reason="Not available for a terminal" />}
              copy={copy}
              open={open}
            />
          }
        />
      </TooltipProvider>
      <div className="flex min-h-0 flex-1 flex-col bg-terminal">
        <div
          aria-label="Embedded terminal"
          className="min-h-0 flex-1 overflow-hidden p-2"
          ref={containerRef}
          role="region"
        />
        {status.kind === 'exited' ? (
          <div className="flex items-center justify-between gap-2 border-t border-terminal-border bg-terminal-border/40 px-3 py-2 text-xs text-terminal-foreground/80">
            <span>Shell exited{status.code !== null ? ` (code ${status.code})` : ''}</span>
            <Button onClick={() => restartEmbeddedTerminalTab(tabId)} size="xs" variant="outline">
              <RetryIcon aria-hidden="true" />
              Restart
            </Button>
          </div>
        ) : null}
        {status.kind === 'error' ? (
          <div className="flex items-center gap-2 border-t border-terminal-border bg-terminal-border/40 px-3 py-2 text-xs text-destructive">
            <AlertCircleIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{status.message}</span>
            <Button onClick={() => restartEmbeddedTerminalTab(tabId)} size="xs" variant="outline">
              <RetryIcon aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The terminal's scrollback as text, or nothing before the terminal starts. */
function terminalText(tabId: string): string | undefined {
  const buffer = getEmbeddedTerminal(tabId)?.term?.buffer.active;
  if (!buffer) return undefined;
  const lines: string[] = [];
  for (let index = 0; index < buffer.length; index += 1)
    lines.push(buffer.getLine(index)?.translateToString(true) ?? '');
  return lines.join('\n').trimEnd();
}

function terminalStatusLabel(status: EmbeddedTerminalStatus): string {
  if (status.kind === 'connecting') return 'Starting';
  if (status.kind === 'running') return 'Running';
  if (status.kind === 'exited')
    return status.code === null ? 'Exited' : `Exited with code ${status.code}`;
  return 'Failed to start';
}
