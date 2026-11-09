import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { Terminal, TerminalContent } from '@/components/ai-elements/terminal';
import { cn } from '@/lib/utils';
import { PresentationLink } from './presentation-link';
import { CopyAction } from './tool-compact-row';

const MONO = 'font-mono text-[11.5px] leading-[18px]';
const BAR = 'flex h-7 min-w-0 items-center gap-2 border-b border-border px-3 text-[11.5px]';

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
      if (lines.length) lines.push({ kind: 'hunk', text: 'â‹¯' });
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (raw.startsWith('+')) lines.push({ kind: 'added', number: newLine++, text: raw.slice(1) });
    else if (raw.startsWith('-'))
      lines.push({ kind: 'removed', number: oldLine++, text: raw.slice(1) });
    else if (raw || lines.length) {
      lines.push({ kind: 'context', number: newLine++, text: raw.slice(1) });
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
}: {
  block: ToolPresentationBlock;
  subject?: ToolPresentationBlock;
}) {
  const text = block.text ?? '';
  const lines = numberedDiff(text);
  const path = block.path || subject?.uri || subject?.label || '';
  const segments = path.split(/[\\/]/u).filter(Boolean);
  const added = lines.filter((line) => line.kind === 'added').length;
  const removed = lines.filter((line) => line.kind === 'removed').length;
  return (
    <div data-slot="transcript-diff" className="min-w-0">
      <div className={BAR}>
        <span className="flex min-w-0 items-center gap-1 truncate text-muted-foreground">
          {segments.map((segment, index) => (
            <span key={`${segment}-${index}`} className="flex min-w-0 items-center gap-1">
              {index ? <span aria-hidden="true">â€º</span> : null}
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
          <span aria-hidden="true">{`+${added} âˆ’${removed}`}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <CopyAction value={text} label="Copy diff" />
          {subject?.type === 'link' && subject.target && subject.target !== 'url' ? (
            <span className="grid size-[22px] place-items-center">
              <PresentationLink block={subject} compact iconOnly />
            </span>
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
}: {
  tool: ToolInvocation;
  block: ToolPresentationBlock;
  live: boolean;
}) {
  const command = block.command || inputText(tool, 'command') || '';
  const where = [inputText(tool, 'host'), inputText(tool, 'cwd')].filter(Boolean).join(' ');
  const output = block.text ?? '';
  return (
    <div data-slot="transcript-terminal" className="min-w-0">
      {command ? (
        <>
          <div className={BAR}>
            <span className="font-medium text-foreground">Command</span>
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
        <span className="font-medium text-foreground">Output</span>
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
    </div>
  );
}
