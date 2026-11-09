import { useContext, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { SourceWindowContext } from '@/lib/source-window';

/** Matches the highlighted source's 11.5px/1.65 lines. Unit: CSS px. */
const SOURCE_LINE_HEIGHT_PX = 19;
/** Rows from the end at which a windowed file asks for its next window. */
const END_REACHED_ROWS = 200;

/** Numbered source lines; only the rows in view are in the document. */
export function VirtualSourceLines({
  content,
  wrap,
  className,
  ...props
}: {
  content: string;
  wrap: boolean;
  className?: string;
  role?: string;
  'aria-label'?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => content.replace(/\r?\n$/u, '').split(/\r?\n/u), [content]);
  // oxlint-disable-next-line react/incompatible-library -- TanStack owns these functions.
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => SOURCE_LINE_HEIGHT_PX,
    overscan: 20,
  });
  // A wrapped line can span rows, so measured sizes from the other mode no longer hold.
  useEffect(() => virtualizer.measure(), [virtualizer, wrap]);
  const items = virtualizer.getVirtualItems();
  const sourceWindow = useContext(SourceWindowContext);
  const lastIndex = items.at(-1)?.index ?? 0;
  const nearEnd = lines.length > 0 && lastIndex >= lines.length - END_REACHED_ROWS;
  const onEndReached = sourceWindow?.onEndReached;
  useEffect(() => {
    if (nearEnd) onEndReached?.();
  }, [nearEnd, onEndReached]);
  const gutter = `${String(lines.length).length + 1}ch`;
  return (
    <div
      {...props}
      ref={scrollRef}
      className={cn(
        'min-h-0 min-w-0 overflow-auto bg-background font-mono text-[11.5px] leading-[19px] text-foreground',
        className,
      )}
      data-slot="virtual-source"
    >
      <div
        className={cn('relative p-4', wrap ? 'w-full' : 'w-max min-w-full')}
        style={{ height: virtualizer.getTotalSize() + 32 }}
      >
        <div style={{ transform: `translateY(${items[0]?.start ?? 0}px)` }}>
          {items.map((item) => (
            <div
              key={item.key}
              data-index={item.index}
              ref={wrap ? virtualizer.measureElement : undefined}
              className={cn(
                'flex',
                wrap ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'whitespace-pre',
              )}
              style={wrap ? undefined : { height: SOURCE_LINE_HEIGHT_PX }}
            >
              <span
                aria-hidden="true"
                className="mr-4 shrink-0 select-none text-right text-muted-foreground/50"
                style={{ width: gutter }}
              >
                {item.index + 1}
              </span>
              <span className="min-w-0">{lines[item.index]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
