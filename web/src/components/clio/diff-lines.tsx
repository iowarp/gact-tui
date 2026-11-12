import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { diffRows, type DiffRow } from './diff-rows';

/** Matches the source view's line height. Unit: CSS px. */
const DIFF_LINE_HEIGHT_PX = 20;
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
        'min-h-0 min-w-0 overflow-auto bg-background font-mono text-ui text-foreground',
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
