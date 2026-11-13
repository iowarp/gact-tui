import { useEffect, useMemo, useRef } from 'react';
import { CircleAlertIcon, TriangleAlertIcon } from 'lucide-react';
import type { LatexDiagnostic } from '@clio/core/v3';
import { cn } from '@/lib/utils';
import { CommentCapture } from './comments/comment-capture';
import { LATEX_WARNING_KINDS, latexKindLabel } from '@/lib/latex-diagnostics';

/**
 * The read-only source of one project file, with each line's build problems in the gutter.
 * Problems are an icon with a label and the message on hover, never a colour alone. Clicking
 * a line asks where it lands in the PDF; selecting text makes a comment mark on this file.
 */
export function LatexSourcePane({
  texts,
  file,
  diagnostics,
  activeLine,
  onLine,
}: {
  texts: Record<string, string>;
  file: string;
  diagnostics: LatexDiagnostic[];
  activeLine?: number;
  onLine: (line: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const text = texts[file];
  const lines = useMemo(() => (text ?? '').split('\n'), [text]);
  const byLine = useMemo(() => {
    const found = new Map<number, LatexDiagnostic[]>();
    for (const item of diagnostics) {
      if (item.file !== file || !item.line) continue;
      found.set(item.line, [...(found.get(item.line) ?? []), item]);
    }
    return found;
  }, [diagnostics, file]);

  useEffect(() => {
    if (!activeLine) return;
    scroller.current
      ?.querySelector<HTMLElement>(`[data-line="${activeLine}"]`)
      ?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    // A line is read from its start: a long line elsewhere may have scrolled the source sideways.
    if (scroller.current) scroller.current.scrollLeft = 0;
  }, [activeLine, file]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-slot="latex-source">
      {text === undefined ? (
        <p className="p-4 text-sm text-muted-foreground">
          {file
            ? 'This file is too large to show here; it is still part of the build.'
            : 'Choose a source file.'}
        </p>
      ) : (
        <CommentCapture className="min-h-0 flex-1" sourcePath={file}>
          <div
            aria-label={`Source of ${file}`}
            className="h-full overflow-auto font-mono text-menu leading-[1.1875rem]"
            ref={scroller}
            role="region"
          >
            <ol className="min-w-max py-1">
              {lines.map((content, index) => {
                const number = index + 1;
                const problems = byLine.get(number) ?? [];
                const failing = problems.some((item) => !LATEX_WARNING_KINDS.has(item.kind));
                const detail = problems
                  .map((item) => `${latexKindLabel(item.kind)}: ${item.message}`)
                  .join('\n');
                return (
                  <li
                    className={cn(
                      'flex cursor-pointer items-start hover:bg-muted/50',
                      activeLine === number && 'bg-primary/10',
                    )}
                    data-line={number}
                    key={number}
                    onClick={(event) => {
                      // A text selection is a comment, not a jump.
                      if (window.getSelection()?.toString()) return;
                      event.stopPropagation();
                      onLine(number);
                    }}
                  >
                    {/* The gutter stays in view when a long line scrolls the source sideways. */}
                    <span
                      className="sticky left-0 z-[1] flex shrink-0 bg-background"
                      data-comment-skip=""
                    >
                      <span
                        className="flex w-5 shrink-0 select-none justify-center pt-[2.5px]"
                        data-comment-skip=""
                      >
                        {problems.length ? (
                          failing ? (
                            <CircleAlertIcon
                              aria-label={detail}
                              className="size-3.5 text-destructive"
                              role="img"
                            >
                              <title>{detail}</title>
                            </CircleAlertIcon>
                          ) : (
                            <TriangleAlertIcon
                              aria-label={detail}
                              className="size-3.5 text-warning"
                              role="img"
                            >
                              <title>{detail}</title>
                            </TriangleAlertIcon>
                          )
                        ) : null}
                      </span>
                      <span
                        className="w-10 shrink-0 select-none pr-3 text-right text-muted-foreground"
                        data-comment-skip=""
                      >
                        {number}
                      </span>
                    </span>
                    <span className="whitespace-pre pr-4">{content || ' '}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </CommentCapture>
      )}
    </div>
  );
}
