import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { Terminal, TerminalContent } from '@/components/ai-elements/terminal';
import { PanelRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PresentationLink } from './presentation-link';
import { CopyAction } from './tool-compact-row';

const MONO = 'font-mono text-[11.5px] leading-[18px]';
const BAR =
  'flex h-[30px] min-w-0 items-center gap-2 border-b border-border pl-2.5 pr-1 text-[11.5px]';

interface DiffLine {
  kind: 'context' | 'added' | 'removed' | 'hunk';
  number?: number;
  text: string;
}

/** Number a unified diff the way the file reads: new numbers, removed lines keep their old one. */
function numberedDiff(text: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const raw of text.split('\n')) {
    if (raw.startsWith('--- ') || raw.startsWith('+++ ') || raw.startsWith('\\')) continue;
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(raw);
    if (hunk) {
      if (lines.length) lines.push({ kind: 'hunk', text: '⋯' });
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (raw.startsWith('+')) lines.push({ kind: 'added', number: newLine++, text: raw.slice(1) });
    else if (raw.startsWith('-'))
      lines.push({ kind: 'removed', number: oldLine++, text: raw.slice(1) });
    else if (raw || lines.length) {
      lines.push({
        kind: 'context',
        number: newLine++,
        text: raw.startsWith(' ') ? raw.slice(1) : raw,
      });
      oldLine++;
    }
  }
  while (lines.at(-1)?.kind === 'context' && !lines.at(-1)?.text) lines.pop();
  return lines;
}

/** A file change in the transcript: path breadcrumb, counts, then numbered lines. */
export function TranscriptDiffBody({
  block,
  subject,
  onOpen,
}: {
  block: ToolPresentationBlock;
  subject?: ToolPresentationBlock;
  /** Opens the changed file when no declared link names it. */
  onOpen?: () => void;
}) {
  const text = block.text ?? '';
  const lines = numberedDiff(text);
  const path = block.path || subject?.uri || subject?.label || '';
  // An absolute path names only its folder and file, as a workspace-relative one would.
  const all = path.split(/[\\/]/u).filter(Boolean);
  const segments = /^(?:[a-z]:[\\/]|[\\/])/iu.test(path) ? all.slice(-2) : all;
  const added = lines.filter((line) => line.kind === 'added').length;
  const removed = lines.filter((line) => line.kind === 'removed').length;
  return (
    <div data-slot="transcript-diff" className="min-w-0">
      <div className={cn(BAR, 'pl-3.5 text-xs')}>
        <span
          className="flex min-w-0 items-center gap-1 truncate text-muted-foreground"
          title={path}
        >
          {segments.map((segment, index) => (
            <span key={`${segment}-${index}`} className="flex min-w-0 items-center gap-1">
              {index ? <span aria-hidden="true">›</span> : null}
              <span
                className={cn(
                  'truncate',
                  index === segments.length - 1 && 'font-medium text-foreground',
                )}
              >
                {segment}
              </span>
            </span>
          ))}
        </span>
        <span className="shrink-0 text-muted-foreground">
          <span className="sr-only">{`${added} lines added, ${removed} removed`}</span>
          <span aria-hidden="true">{`+${added} −${removed}`}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <CopyAction value={text} label="Copy diff" />
          {subject?.type === 'link' && subject.target && subject.target !== 'url' ? (
            <span className="grid size-[22px] place-items-center">
              <PresentationLink block={subject} compact iconOnly />
            </span>
          ) : onOpen ? (
            <Button
              aria-label={`Open ${segments.at(-1) ?? path}`}
              className="size-[22px] text-muted-foreground hover:text-foreground"
              onClick={onOpen}
              size="icon-xs"
              title={`Open ${path}`}
              variant="ghost"
            >
              <PanelRightIcon aria-hidden="true" className="size-3.5" />
            </Button>
          ) : null}
        </span>
      </div>
      <div className={cn('max-h-80 overflow-auto py-1', MONO)} role="table" aria-label="Changes">
        {lines.map((line, index) => (
          <div
            key={index}
            role="row"
            data-diff-line={line.kind}
            className={cn(
              'grid grid-cols-[3rem_minmax(0,1fr)]',
              line.kind === 'added' && 'bg-success/12',
              line.kind === 'removed' && 'bg-destructive/12',
            )}
          >
            <span role="cell" className="select-none pr-3 text-right text-muted-foreground/70">
              {line.number ?? ''}
            </span>
            <span role="cell" className="whitespace-pre pr-3 text-foreground/90">
              {line.kind === 'added' ? (
                <span className="sr-only">Added: </span>
              ) : line.kind === 'removed' ? (
                <span className="sr-only">Removed: </span>
              ) : null}
              {line.kind === 'hunk' ? (
                <span className="text-muted-foreground">{line.text}</span>
              ) : (
                line.text
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function inputText(tool: ToolInvocation, key: string): string | undefined {
  const input = tool.input as Record<string, unknown> | undefined;
  const value = input?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** A command in the transcript: the command with where it ran, then its output. */
export function TranscriptTerminalBody({
  tool,
  block,
  live,
  failure,
  failed = true,
}: {
  tool: ToolInvocation;
  block: ToolPresentationBlock;
  live: boolean;
  /** Why the command failed, when its output does not already say. */
  failure?: string;
  /** A stopped command's reason reads muted, not as a failure. */
  failed?: boolean;
}) {
  const command = block.command || inputText(tool, 'command') || '';
  const where = [inputText(tool, 'host'), inputText(tool, 'cwd')].filter(Boolean).join(' ');
  const output = block.text ?? '';
  return (
    <div data-slot="transcript-terminal" className="min-w-0">
      {command ? (
        <>
          <div className={BAR}>
            <span className="text-xs font-medium text-foreground">Command</span>
            {where ? (
              <span className="ml-auto truncate font-mono text-muted-foreground" title="Ran on">
                {where}
              </span>
            ) : null}
            <span className={cn('flex shrink-0 items-center', !where && 'ml-auto')}>
              <CopyAction value={command} label="Copy command" />
            </span>
          </div>
          <pre className={cn('overflow-x-auto border-b border-border px-3 py-1.5', MONO)}>
            <span aria-hidden="true" className="mr-2 text-muted-foreground">
              $
            </span>
            {command}
          </pre>
        </>
      ) : null}
      <div className={BAR}>
        <span className="text-xs font-medium text-foreground">Output</span>
        {live ? <span className="text-muted-foreground">live</span> : null}
      </div>
      {output ? (
        <Terminal
          output={output}
          autoScroll={live}
          isStreaming={live}
          className="rounded-none border-0 bg-transparent text-foreground/90"
        >
          <TerminalContent className={cn('max-h-60 border-0 bg-transparent px-3 py-1.5', MONO)} />
        </Terminal>
      ) : (
        <p className="px-3 py-1.5 text-[11.5px] text-muted-foreground">
          {live ? 'Waiting for output' : 'No output'}
        </p>
      )}
      {failure ? (
        <p
          role={failed ? 'alert' : undefined}
          className={cn(
            'whitespace-pre-wrap border-t border-border px-3 py-1.5 text-[11.5px] [overflow-wrap:anywhere]',
            failed ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {failure.length > 1200 ? `${failure.slice(0, 1200)}…` : failure}
        </p>
      ) : null}
    </div>
  );
}
