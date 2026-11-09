import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import {
  memo,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { cn } from '@/lib/utils';
import {
  denseGridOrder,
  denseGridRawText,
  denseGridText,
  registerDenseGridText,
  type DenseGridColumn,
  type DenseGridRow,
  type DenseGridSort,
} from './dense-grid-data';
import { StateView } from './state-view';

export type { DenseGridColumn, DenseGridRow, DenseGridSort } from './dense-grid-data';

/** Header and body rows: 12 px mono, 6 px above and below, a 1 px rule. Unit: CSS px. */
export const DENSE_GRID_ROW_HEIGHT_PX = 28;
/** Space above the header, as in the spec table. Unit: CSS px. */
const TOP_GAP_PX = 6;
/** The body's first row starts below the gap and the sticky header. Unit: CSS px. */
const BODY_OFFSET_PX = TOP_GAP_PX + DENSE_GRID_ROW_HEIGHT_PX;
/** Inline padding of the frame body (Tailwind `px-3.5`). Unit: CSS px. */
const INLINE_PADDING_PX = 14;
/** Advance of one 12 px monospace glyph. Unit: CSS px. */
const MONO_CHAR_PX = 7.2;
/** Average advance of one 11 px interface glyph in a header. Unit: CSS px. */
const HEADER_CHAR_PX = 6.6;
/** Cell padding (8 px each side). Unit: CSS px. */
const CELL_PADDING_PX = 16;
/** Room for the sort arrow beside a header name. Unit: CSS px. */
const SORT_MARK_PX = 16;
const MIN_COLUMN_PX = 64;
const MAX_COLUMN_PX = 320;
const MIN_GUTTER_PX = 36;
/** Values sampled per column, spread over the rows, to size it. */
const WIDTH_SAMPLE_ROWS = 200;
/** Small grids mount every row; larger ones only the rows in view. */
const WINDOW_ABOVE_ROWS = 150;

function defaultFormat(value: unknown): string {
  return denseGridRawText(value);
}

function columnWidths(
  columns: readonly DenseGridColumn[],
  rows: readonly DenseGridRow[],
  format: (value: unknown, key: string) => string,
): number[] {
  const step = Math.max(1, Math.floor(rows.length / WIDTH_SAMPLE_ROWS));
  return columns.map((column) => {
    let chars = 0;
    for (let index = 0; index < rows.length; index += step) {
      chars = Math.max(chars, format(rows[index][column.key], column.key).length);
    }
    const header = column.label.length * HEADER_CHAR_PX + CELL_PADDING_PX + SORT_MARK_PX;
    const body = chars * MONO_CHAR_PX + CELL_PADDING_PX;
    return Math.min(MAX_COLUMN_PX, Math.max(MIN_COLUMN_PX, Math.ceil(Math.max(header, body))));
  });
}

interface ActiveCell {
  /** Display position of the row. */
  row: number;
  col: number;
}

export interface DenseGridProps {
  columns: readonly DenseGridColumn[];
  rows: readonly DenseGridRow[];
  /** The grid's accessible name (the file or dataset). */
  label: string;
  /** Display text of a value; the stored text stays in the hover name and Copy. */
  format?: (value: unknown, key: string) => string;
  className?: string;
}

/**
 * The dense data grid of a file body: a sticky header of column names, a
 * sticky gutter of row numbers, 28 px rows of monospace values and one
 * continuous scroll. Large grids mount only the rows in view. A header sorts
 * ascending, descending, then back to file order. Arrow keys move a selected
 * cell; Copy with a selected cell copies its stored value.
 */
export const DenseGrid = memo(function DenseGrid({
  columns,
  rows,
  label,
  format = defaultFormat,
  className,
}: DenseGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const idPrefix = useId();
  const [sort, setSort] = useState<DenseGridSort>();
  const [active, setActive] = useState<ActiveCell>();
  const order = useMemo(() => denseGridOrder(rows, sort), [rows, sort]);
  const widths = useMemo(() => columnWidths(columns, rows, format), [columns, rows, format]);
  const gutterWidth = Math.max(
    MIN_GUTTER_PX,
    Math.ceil(String(rows.length).length * MONO_CHAR_PX) + CELL_PADDING_PX,
  );
  const contentWidth =
    gutterWidth + widths.reduce((sum, width) => sum + width, 0) + INLINE_PADDING_PX * 2;
  const windowed = rows.length > WINDOW_ABOVE_ROWS;
  // oxlint-disable-next-line react/incompatible-library -- TanStack owns these functions.
  const virtualizer = useVirtualizer({
    count: order.length,
    enabled: windowed,
    estimateSize: () => DENSE_GRID_ROW_HEIGHT_PX,
    getScrollElement: () => scrollRef.current,
    overscan: 12,
    scrollMargin: BODY_OFFSET_PX,
    scrollPaddingStart: DENSE_GRID_ROW_HEIGHT_PX,
  });
  const positions = windowed
    ? virtualizer.getVirtualItems().map((item) => item.index)
    : order.map((_, position) => position);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    return registerDenseGridText(element, () => denseGridText(columns, rows, order));
  }, [columns, order, rows]);

  const cellId = (cell: ActiveCell) => `${idPrefix}-${cell.row}-${cell.col}`;
  const reveal = useCallback(
    (cell: ActiveCell) => {
      if (windowed) virtualizer.scrollToIndex(cell.row, { align: 'auto' });
      requestAnimationFrame(() => {
        const element = document.getElementById(`${idPrefix}-${cell.row}-${cell.col}`);
        if (element && typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      });
    },
    [idPrefix, virtualizer, windowed],
  );

  const toggleSort = (key: string) => {
    setActive(undefined);
    setSort((current) =>
      current?.key !== key ? { key, desc: false } : current.desc ? undefined : { key, desc: true },
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !order.length || !columns.length) return;
    const lastRow = order.length - 1;
    const lastCol = columns.length - 1;
    const page = Math.max(
      1,
      Math.floor((event.currentTarget.clientHeight - BODY_OFFSET_PX) / DENSE_GRID_ROW_HEIGHT_PX),
    );
    const from = active ?? { row: 0, col: 0 };
    const control = event.ctrlKey || event.metaKey;
    let next: ActiveCell | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = active ? { ...from, row: Math.min(lastRow, from.row + 1) } : from;
        break;
      case 'ArrowUp':
        next = { ...from, row: Math.max(0, from.row - 1) };
        break;
      case 'ArrowRight':
        next = active ? { ...from, col: Math.min(lastCol, from.col + 1) } : from;
        break;
      case 'ArrowLeft':
        next = { ...from, col: Math.max(0, from.col - 1) };
        break;
      case 'PageDown':
        next = { ...from, row: Math.min(lastRow, from.row + page) };
        break;
      case 'PageUp':
        next = { ...from, row: Math.max(0, from.row - page) };
        break;
      case 'Home':
        next = control ? { row: 0, col: 0 } : { ...from, col: 0 };
        break;
      case 'End':
        next = control ? { row: lastRow, col: lastCol } : { ...from, col: lastCol };
        break;
      case 'Escape':
        if (!active) return;
        setActive(undefined);
        event.preventDefault();
        event.stopPropagation();
        return;
      default:
        return;
    }
    event.preventDefault();
    setActive(next);
    reveal(next);
  };

  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-grid-cell]');
    if (!cell) return;
    setActive({ row: Number(cell.dataset.row), col: Number(cell.dataset.col) });
  };

  const onCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!active || event.target !== event.currentTarget) return;
    if (window.getSelection()?.toString()) return;
    const row = rows[order[active.row]];
    const column = columns[active.col];
    if (!row || !column) return;
    event.clipboardData.setData('text/plain', denseGridRawText(row[column.key]));
    event.preventDefault();
  };

  return (
    <div
      aria-activedescendant={active ? cellId(active) : undefined}
      aria-colcount={columns.length + 1}
      aria-label={label}
      aria-rowcount={rows.length + 1}
      className={cn(
        'relative min-h-0 min-w-0 overflow-auto overscroll-contain bg-background font-mono text-xs text-foreground outline-none focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ring',
        className,
      )}
      data-slot="dense-grid"
      onCopy={onCopy}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      ref={scrollRef}
      role="grid"
      style={{ scrollPaddingTop: DENSE_GRID_ROW_HEIGHT_PX, scrollPaddingLeft: gutterWidth }}
      tabIndex={0}
    >
      <div
        className="px-3.5"
        style={{ width: `max(100%, ${contentWidth}px)`, paddingTop: TOP_GAP_PX }}
      >
        <div className="sticky top-0 z-20 bg-background" role="rowgroup">
          <div aria-rowindex={1} className="flex h-7 border-b border-border" role="row">
            <div
              aria-colindex={1}
              className="sticky left-0 z-10 shrink-0 bg-background"
              role="columnheader"
              style={{ width: gutterWidth }}
            >
              <span className="sr-only">Row</span>
            </div>
            {columns.map((column, index) => {
              const sorted = sort?.key === column.key ? sort : undefined;
              const Arrow = sorted?.desc ? ArrowDownIcon : ArrowUpIcon;
              return (
                <div
                  aria-colindex={index + 2}
                  aria-sort={sorted ? (sorted.desc ? 'descending' : 'ascending') : undefined}
                  className="min-w-0"
                  key={column.key}
                  role="columnheader"
                  style={{ flex: `${widths[index]} 0 ${widths[index]}px` }}
                >
                  <button
                    className="flex h-full w-full min-w-0 cursor-pointer items-center gap-1 px-2 text-left font-sans text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                    onClick={() => toggleSort(column.key)}
                    title={column.label}
                    type="button"
                  >
                    <span className="truncate">{column.label}</span>
                    {sorted ? <Arrow aria-hidden="true" className="size-3 shrink-0" /> : null}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        {order.length ? (
          <div
            className="relative"
            role="rowgroup"
            style={{ height: order.length * DENSE_GRID_ROW_HEIGHT_PX }}
          >
            {positions.map((position) => (
              <DenseGridRowView
                activeCol={active?.row === position ? active.col : undefined}
                columns={columns}
                format={format}
                gutterWidth={gutterWidth}
                idPrefix={idPrefix}
                key={order[position]}
                number={order[position] + 1}
                position={position}
                row={rows[order[position]]}
                widths={widths}
              />
            ))}
          </div>
        ) : (
          <StateView kind="empty" size="row" title="No rows" />
        )}
      </div>
    </div>
  );
});

const DenseGridRowView = memo(function DenseGridRowView({
  row,
  position,
  number,
  columns,
  widths,
  gutterWidth,
  format,
  idPrefix,
  activeCol,
}: {
  row: DenseGridRow;
  position: number;
  /** The row's number in the file, kept while sorted. */
  number: number;
  columns: readonly DenseGridColumn[];
  widths: readonly number[];
  gutterWidth: number;
  format: (value: unknown, key: string) => string;
  idPrefix: string;
  activeCol: number | undefined;
}) {
  return (
    <div
      aria-rowindex={position + 2}
      className="group/row absolute inset-x-0 flex h-7 items-center border-b border-border/60 hover:bg-hover"
      role="row"
      style={{ top: position * DENSE_GRID_ROW_HEIGHT_PX }}
    >
      <div
        aria-colindex={1}
        className="sticky left-0 z-10 flex h-full shrink-0 items-center justify-end bg-background pr-2 text-faint tabular-nums select-none group-hover/row:bg-hover"
        role="rowheader"
        style={{ width: gutterWidth }}
      >
        {number}
      </div>
      {columns.map((column, index) => {
        const value = row[column.key];
        const text = format(value, column.key);
        const raw = denseGridRawText(value);
        const width = widths[index];
        const clipped = raw.length * MONO_CHAR_PX > width - CELL_PADDING_PX;
        const selected = activeCol === index;
        return (
          <div
            aria-colindex={index + 2}
            aria-selected={selected || undefined}
            className={cn(
              'flex h-full min-w-0 items-center px-2 tabular-nums',
              selected && 'bg-hover ring-1 ring-muted-foreground/70 ring-inset',
            )}
            data-col={index}
            data-grid-cell=""
            data-row={position}
            id={`${idPrefix}-${position}-${index}`}
            key={column.key}
            role="gridcell"
            style={{ flex: `${width} 0 ${width}px` }}
            title={clipped || raw !== text ? raw : undefined}
          >
            <span className="truncate">{text}</span>
          </div>
        );
      })}
    </div>
  );
});
