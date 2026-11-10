import type { Ref } from 'react';
import type { BundledLanguage } from 'shiki';
import { FileCode2Icon, NotebookTextIcon } from 'lucide-react';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DOCUMENT_MARKDOWN_CLASS_NAME, READ_TYPE_SCALE } from '@/lib/document-markdown';
import type { NotebookCell, NotebookOutput, NotebookRead } from '@/lib/notebook';
import { cn } from '@/lib/utils';
import { ContentMarkdown } from './content-markdown';
import { StateView } from './primitives/state-view';

/** The code viewer's type: 11.5 px mono at 1.65. */
const MONO = 'font-mono text-[11.5px] leading-[1.65]';

/** Long terminal output scrolls inside its block, as Jupyter's does. */
const TEXT_BLOCK = cn(
  MONO,
  'm-0 max-h-96 overflow-auto px-3 py-1.5 whitespace-pre-wrap [overflow-wrap:anywhere]',
);

/**
 * A notebook read as cells: Markdown rendered, code highlighted under its run count,
 * and each cell's outputs beneath it. Read-only; Source keeps the file's JSON.
 */
export function NotebookView({
  read,
  name,
  readingRef,
  onShowSource,
}: {
  read: NotebookRead;
  name: string;
  readingRef?: Ref<HTMLDivElement>;
  /** The states' way out: switches the frame to Source, which the narrow bar folds into ⋯. */
  onShowSource?: () => void;
}) {
  const showSource = onShowSource
    ? { label: 'Show source', icon: <FileCode2Icon />, onClick: onShowSource }
    : undefined;
  if (!read.ok)
    return (
      <StateView
        action={showSource}
        detail={read.reason}
        kind="error"
        size="viewer"
        title="Couldn't read it"
      />
    );
  const { cells, language } = read.notebook;
  if (!cells.length)
    return (
      <StateView
        action={showSource}
        icon={NotebookTextIcon}
        kind="empty"
        size="viewer"
        title="This notebook has no cells"
      />
    );
  return (
    <ScrollArea
      className="h-full min-w-0"
      viewportProps={{ className: '[&>div]:!block [&>div]:min-w-0 [&>div]:w-full' }}
    >
      <div className="contents" ref={readingRef}>
        <ol
          aria-label={`Cells of ${name}`}
          className="mx-auto flex w-full max-w-[110ch] min-w-0 list-none flex-col gap-3 px-4 py-4 @max-[36rem]/viewer:px-3"
        >
          {cells.map((cell, index) => (
            <NotebookCellView
              cell={cell}
              // Cells have no stable identity before nbformat 4.5; their order is the file's.
              key={index}
              language={language}
              number={index + 1}
            />
          ))}
        </ol>
      </div>
    </ScrollArea>
  );
}

function NotebookCellView({
  cell,
  number,
  language,
}: {
  cell: NotebookCell;
  number: number;
  language: BundledLanguage;
}) {
  const code = cell.kind === 'code';
  const run = code ? (cell.count === null ? 'not run' : `run ${cell.count}`) : undefined;
  return (
    <li
      aria-label={`Cell ${number}, ${code ? `code, ${run}` : cell.kind === 'markdown' ? 'text' : 'raw'}`}
      className="grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2 [content-visibility:auto] [contain-intrinsic-size:auto_6rem] @max-[36rem]/viewer:grid-cols-1"
      data-cell-kind={cell.kind}
    >
      {/* Jupyter's prompt column: the run count, faint and right-aligned. */}
      <span
        aria-hidden="true"
        className={cn(
          MONO,
          'pt-[7px] text-right text-faint tabular-nums select-none @max-[36rem]/viewer:pt-0 @max-[36rem]/viewer:pb-0.5 @max-[36rem]/viewer:text-left',
          !code && '@max-[36rem]/viewer:hidden',
        )}
      >
        {code ? `[${cell.count ?? ' '}]` : ''}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        {cell.kind === 'markdown' ? (
          <ContentMarkdown className={cn(DOCUMENT_MARKDOWN_CLASS_NAME, READ_TYPE_SCALE)}>
            {cell.source}
          </ContentMarkdown>
        ) : cell.kind === 'raw' ? (
          cell.source ? (
            <pre className={cn(TEXT_BLOCK, 'rounded-md border text-muted-foreground')}>
              {cell.source}
            </pre>
          ) : null
        ) : (
          <>
            <CodeBlock
              aria-label={`Code of cell ${number}`}
              code={cell.source || ' '}
              language={language}
              className={cn(
                'bg-muted/40 [&_pre]:!bg-transparent [&_pre]:px-3 [&_pre]:py-1.5 [&_pre]:w-max [&_pre]:min-w-full [&_pre]:whitespace-pre [&_pre]:[overflow-wrap:normal]',
                '[&_:is(pre,code)]:!text-[11.5px] [&_pre]:leading-[1.65]',
              )}
            />
            {cell.outputs.map((output, index) => (
              <NotebookOutputView key={index} output={output} />
            ))}
          </>
        )}
      </div>
    </li>
  );
}

function NotebookOutputView({ output }: { output: NotebookOutput }) {
  switch (output.kind) {
    case 'stream':
      return output.stream === 'stderr' ? (
        <div
          aria-label="Standard error"
          className="relative rounded-md bg-[color:color-mix(in_oklab,var(--warning)_9%,transparent)]"
          role="group"
        >
          <span className="absolute top-1 right-2 text-[10.5px] text-muted-foreground">stderr</span>
          <pre className={cn(TEXT_BLOCK, 'pr-14')}>{output.text}</pre>
        </div>
      ) : (
        <pre className={TEXT_BLOCK}>{output.text}</pre>
      );
    case 'text':
      // A result's repr is laid out in columns (a DataFrame); it scrolls rather than wraps.
      return (
        <pre className={cn(MONO, 'm-0 max-h-96 overflow-auto px-3 py-1.5 whitespace-pre')}>
          {output.text}
        </pre>
      );
    case 'html':
      return (
        <div className="min-w-0 overflow-x-auto px-3 py-1 [&_table]:text-[12px]">
          {/* Streamdown sanitizes raw HTML: scripts, styles and handlers are dropped. The
              frame bar owns copy and download, so an output table has no toolbar of its own. */}
          <ContentMarkdown
            className={cn(DOCUMENT_MARKDOWN_CLASS_NAME, 'text-[12.5px]')}
            controls={{ table: false }}
          >
            {htmlBlock(output.html)}
          </ContentMarkdown>
        </div>
      );
    case 'markdown':
      return (
        <div className="min-w-0 px-3 py-1">
          <ContentMarkdown
            className={cn(DOCUMENT_MARKDOWN_CLASS_NAME, READ_TYPE_SCALE)}
            controls={{ table: false }}
          >
            {output.markdown}
          </ContentMarkdown>
        </div>
      );
    case 'image':
      return (
        <div className="min-w-0 px-3 py-1">
          <img alt={output.alt} className="h-auto max-w-full" decoding="async" src={output.src} />
        </div>
      );
    case 'error':
      return (
        <div
          aria-label={`Error: ${output.name}`}
          className="min-w-0 rounded-md border border-destructive/35 bg-destructive/5"
          role="group"
        >
          <p className={cn(MONO, 'px-3 pt-1.5 [overflow-wrap:anywhere]')}>
            <span className="font-semibold text-destructive">{output.name}</span>
            {output.value ? <span className="text-foreground">: {output.value}</span> : null}
          </p>
          {output.traceback ? (
            <pre className={cn(TEXT_BLOCK, 'text-muted-foreground')}>{output.traceback}</pre>
          ) : (
            <div className="h-1.5" />
          )}
        </div>
      );
  }
}

/**
 * HTML output as one Markdown HTML block: indentation would otherwise turn nested
 * lines into code, and a blank line would end the block early.
 */
function htmlBlock(html: string): string {
  if (/<pre\b/iu.test(html)) return html.replace(/\n\s*\n/gu, '\n');
  return html
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}
