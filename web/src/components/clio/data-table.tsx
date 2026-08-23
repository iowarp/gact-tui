import type { ColumnDef } from '@tanstack/react-table';
import { useTable } from '@tanstack/react-table';
import { Table2Icon } from 'lucide-react';
import { useMemo } from 'react';
import { Badge as ReUIBadge } from '@/components/reui/badge';
import { DataGridColumnHeader } from '@/components/reui/data-grid/data-grid-column-header';
import { DataGridPagination } from '@/components/reui/data-grid/data-grid-pagination';
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table';
import {
  DataGrid,
  DataGridContainer,
  dataGridFeatures,
  type DataGridFeatures,
} from '@/components/reui/data-grid/data-grid';

export type ClioDataColumn = string | { key: string; label: string };
export type ClioDataRow = Record<string, unknown>;

/** Interactive, resizable data table shared by native resources and A2UI surfaces. */
export function ClioDataTable({
  columns: columnDefinitions,
  rows,
  label = 'Data table',
  onRowClick,
}: {
  columns: readonly ClioDataColumn[];
  rows: readonly ClioDataRow[];
  label?: string;
  onRowClick?: (row: ClioDataRow) => void;
}) {
  const columns = useMemo<ColumnDef<DataGridFeatures, ClioDataRow, unknown>[]>(
    () =>
      columnDefinitions.map((definition) => {
        const key = typeof definition === 'string' ? definition : definition.key;
        const title =
          typeof definition === 'string' ? definition.replaceAll('_', ' ') : definition.label;
        return {
          id: key,
          accessorFn: (row: ClioDataRow) => row[key],
          header: ({ column }) => <DataGridColumnHeader column={column} title={title} />,
          cell: ({ row }) => (
            <span className="font-mono text-xs">{formatCell(row.original[key])}</span>
          ),
          meta: { autoSize: true, headerTitle: title },
        };
      }),
    [columnDefinitions],
  );
  const table = useTable({ columns, data: [...rows], features: dataGridFeatures });

  return (
    <DataGrid<DataGridFeatures, ClioDataRow>
      emptyMessage="No rows were provided for this data view."
      onRowClick={onRowClick}
      recordCount={rows.length}
      table={table}
      tableLayout={{ columnsResizable: true, dense: true, headerSticky: true, width: 'fixed' }}
    >
      <DataGridContainer className="overflow-hidden rounded-xl border">
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
          <Table2Icon aria-hidden="true" className="size-3.5 text-primary" />
          <ReUIBadge radius="full" variant="primary-light">
            {label}, {rows.length.toLocaleString()} rows
          </ReUIBadge>
        </div>
        <DataGridTable />
        {rows.length > 10 ? (
          <div className="border-t px-3">
            <DataGridPagination sizes={[10, 25, 50, 100]} />
          </div>
        ) : null}
      </DataGridContainer>
    </DataGrid>
  );
}

function formatCell(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Unavailable';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
