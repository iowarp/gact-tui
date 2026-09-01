import { flexRender } from '@tanstack/react-table';
import type { Header, Row } from '@tanstack/react-table';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import {
  type DataGridFeatures,
  type DataGridTableInstance,
  useDataGrid,
} from '@/components/reui/data-grid/data-grid';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/**
 * CLIO-owned TanStack v9 table renderer.
 *
 * ReUI still owns the feature bundle, pagination, and column controls. This
 * renderer owns the load-bearing v9 render seam so column visibility,
 * pagination, resizing, empty states, and row activation are covered by CLIO's
 * lint, file-size, and test ratchets.
 */
export function ClioDataGridTable() {
  const { isLoading, props, table } = useDataGrid();
  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const resizable = Boolean(props.tableLayout?.columnsResizable);
  const tableStyle: CSSProperties | undefined = resizable
    ? { minWidth: '100%', width: Math.max(table.getTotalSize(), 1) }
    : undefined;

  return (
    <div
      className="max-w-full overflow-x-auto overscroll-x-contain"
      data-slot="clio-data-grid-viewport"
    >
      <table
        className={cn(
          'w-full caption-bottom border-separate border-spacing-0 text-left text-sm rtl:text-right',
          props.tableLayout?.width === 'auto' ? 'table-auto' : 'table-fixed',
          props.tableClassNames?.base,
        )}
        data-slot="clio-data-grid-table"
        style={tableStyle}
      >
        <thead
          className={cn(
            props.tableLayout?.headerSticky && props.tableClassNames?.headerSticky,
            props.tableClassNames?.header,
          )}
        >
          {headerGroups.map((headerGroup) => (
            <tr className={props.tableClassNames?.headerRow} key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <ClioDataGridHeaderCell header={header} key={header.id} />
              ))}
            </tr>
          ))}
        </thead>
        <tbody className={props.tableClassNames?.body}>
          {isLoading ? (
            <tr>
              <td
                className="h-32 text-center text-muted-foreground"
                colSpan={visibleColumnCount(table)}
              >
                <span className="inline-flex items-center gap-2">
                  <Spinner className="size-4" />
                  {props.loadingMessage || 'Loading rows'}
                </span>
              </td>
            </tr>
          ) : rows.length ? (
            rows.map((row) => <ClioDataGridRow key={row.id} row={row} />)
          ) : (
            <tr>
              <td
                className="h-32 px-4 text-center text-muted-foreground"
                colSpan={visibleColumnCount(table)}
              >
                {props.emptyMessage || 'No rows available.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ClioDataGridHeaderCell<TData extends object>({
  header,
}: {
  header: Header<DataGridFeatures, TData, unknown>;
}) {
  const { props, table } = useDataGrid<TData>();
  const { column } = header;
  const sort = column.getIsSorted();
  const canResize = Boolean(props.tableLayout?.columnsResizable && column.getCanResize());
  const resizeHandler = header.getResizeHandler();

  return (
    <th
      aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined}
      className={cn(
        'relative h-10 border-b px-3 text-left align-middle font-medium rtl:text-right',
        props.tableLayout?.dense && 'h-8 px-2',
        props.tableLayout?.headerBackground && 'bg-muted',
        props.tableLayout?.cellBorder && 'border-e',
        column.columnDef.meta?.headerClassName,
      )}
      colSpan={header.colSpan > 1 ? header.colSpan : undefined}
      scope="col"
      style={{ width: column.getSize() }}
    >
      {header.isPlaceholder ? null : flexRender(column.columnDef.header, header.getContext())}
      {canResize ? (
        <div
          aria-label={`Resize ${column.columnDef.meta?.headerTitle || column.id}`}
          className={cn(
            'absolute inset-y-0 -end-2 z-10 flex w-5 cursor-col-resize touch-none select-none justify-center',
            'before:w-px before:bg-border',
            column.getIsResizing() && 'before:w-0.5 before:bg-primary',
          )}
          onDoubleClick={() => column.resetSize()}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            resizeHandler(event);
          }}
          onTouchStart={(event) => {
            event.preventDefault();
            event.stopPropagation();
            resizeHandler(event);
          }}
          role="separator"
          tabIndex={-1}
        />
      ) : null}
      {table.options.columnResizeMode === 'onEnd' && column.getIsResizing() ? (
        <span aria-hidden="true" className="absolute inset-y-0 end-0 w-px bg-primary" />
      ) : null}
    </th>
  );
}

function ClioDataGridRow<TData extends object>({ row }: { row: Row<DataGridFeatures, TData> }) {
  const { props } = useDataGrid<TData>();
  const expandedContent = row
    .getVisibleCells()
    .map((cell) => cell.column.columnDef.meta?.expandedContent)
    .find(Boolean);
  const interactive = Boolean(props.onRowClick);
  const activate = () => props.onRowClick?.(row.original);
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (!interactive || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    activate();
  };

  return (
    <>
      <tr
        aria-selected={row.getIsSelected() || undefined}
        className={cn(
          'group/row transition-colors hover:bg-muted/40',
          props.tableLayout?.rowBorder && '[&>td]:border-b',
          props.tableLayout?.stripped && 'even:bg-muted/30',
          interactive &&
            'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          row.getIsSelected() && 'bg-primary/10',
          props.tableClassNames?.bodyRow,
        )}
        onClick={interactive ? activate : undefined}
        onKeyDown={onKeyDown}
        tabIndex={interactive ? 0 : undefined}
      >
        {row.getVisibleCells().map((cell) => (
          <td
            className={cn(
              'px-3 py-2 align-middle',
              props.tableLayout?.dense && 'px-2 py-1.5',
              props.tableLayout?.cellBorder && 'border-e',
              cell.column.columnDef.meta?.cellClassName,
            )}
            key={cell.id}
            style={{ width: cell.column.getSize() }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
      {row.getIsExpanded() && expandedContent ? (
        <tr>
          <td className="border-b p-3" colSpan={row.getVisibleCells().length}>
            {expandedContent(row.original) as ReactNode}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function visibleColumnCount<TData extends object>(table: DataGridTableInstance<TData>): number {
  return Math.max(table.getVisibleLeafColumns().length, 1);
}
