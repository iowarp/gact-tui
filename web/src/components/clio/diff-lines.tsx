import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';

/** Matches the source view's line height. Unit: CSS px. */
const DIFF_LINE_HEIGHT_PX = 20;
const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/u;

export interface DiffRow {
  kind: 'addition' | 'deletion' | 'context' | 'hunk';
  /** The file line: the new file's, or the old file's for a removed line. */
  line?: number;
  text: string;
}

/** A unified diff as file lines; patch headers become hunk separators. */
export function diffRows(unified: string): DiffRow[] {
  const source = unified.replace(/\r?\n$/u, '').split(/\r?\n/u);
  if (!source.some((text) => HUNK.test(text)))
    return source.map((text, index) => ({ kind: 'context', line: index + 1, text }));
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const text of source) {
    const hunk = HUNK.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      rows.push({ kind: 'hunk', text: hunk[3] ?? '' });
    } else if (!inHunk || text.startsWith('\\')) {
      continue;
    } else if (text.startsWith('+')) {
      rows.push({ kind: 'addition', line: newLine++, text: text.slice(1) });
    } else if (text.startsWith('-')) {
      rows.push({ kind: 'deletion', line: oldLine++, text: text.slice(1) });
    } else {
      rows.push({ kind: 'context', line: newLine++, text: text.slice(1) });
      oldLine += 1;
    }
  }
  return rows;
}

const MARK: Record<DiffRow['kind'], string> = {
  addition: '+',
  deletion: '−',
  context: ' ',
  hunk: ' ',
};

/** A change flush in its frame: one line-number gutter, no wrapping, only rows in view mounted. */
export function DiffLines({ unified, className }: { unified: string; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => diffRows(unified), [unified]);
  // oxlint-disable-next-line react/incompatible-library -- TanStack owns these functions.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DIFF_LINE_HEIGHT_PX,
    overscan: 20,
  });
  const items = virtualizer.getVirtualItems();
  const widest = rows.reduce((most, row) => Math.max(most, row.line ?? 0), 0);
  const gutter = `${String(widest).length + 1}ch`;
  return (
    <div
      ref={scrollRef}
      aria-label="Changed lines"
      className={cn(
        'min-h-0 min-w-0 overflow-auto bg-background font-mono text-[13px] text-foreground',
        className,
      )}
      data-slot="diff-lines"
      role="region"
      tabIndex={0}
    >
      <div
        className="relative w-max min-w-full py-2"
        style={{ height: virtualizer.getTotalSize() + 16 }}
      >
        <div style={{ transform: `translateY(${items[0]?.start ?? 0}px)` }}>
          {items.map((item) => {
            const row = rows[item.index]!;
            return (
              <div
                key={item.key}
                className={cn(
                  'flex whitespace-pre',
                  row.kind === 'hunk' && 'bg-muted/60 text-muted-foreground italic',
                )}
                data-diff-line={
                  row.kind === 'hunk' || row.kind === 'context' ? undefined : row.kind
                }
                data-index={item.index}
                style={{
                  height: DIFF_LINE_HEIGHT_PX,
                  lineHeight: `${DIFF_LINE_HEIGHT_PX}px`,
                  paddingInline: 0,
                }}
              >
                <span
                  aria-hidden="true"
                  className="shrink-0 select-none pl-3 pr-3 text-right text-muted-foreground/60"
                  style={{ width: `calc(${gutter} + 1.5rem)` }}
                >
                  {row.kind === 'hunk' ? '⋯' : row.line}
                </span>
                <span
                  aria-label={
                    row.kind === 'addition'
                      ? 'Added'
                      : row.kind === 'deletion'
                        ? 'Removed'
                        : undefined
                  }
                  className="w-3 shrink-0 select-none text-muted-foreground"
                >
                  {MARK[row.kind]}
                </span>
                <span className="pr-4">{row.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
