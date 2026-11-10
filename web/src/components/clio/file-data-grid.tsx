import { useMemo, type ReactNode } from 'react';
import { DenseGrid, type DenseGridRow } from './primitives/dense-grid';
import { formatDataCell } from './data-cell-format';
import { FILE_SIZE_FACT, useFileViewerFacts } from './file-viewer-facts';

function formatFileCell(value: unknown, key: string): string {
  return value === undefined || value === null || value === '' ? '' : formatDataCell(value, key);
}

/**
 * A tabular file body (CSV, TSV, JSON records): the dense grid filling the
 * frame, its row count in the frame bar, and at most one faint status line
 * for what the preview holds back.
 */
export function FileDataGrid({
  columns,
  rows,
  label,
  fact,
  status,
}: {
  columns: readonly string[];
  rows: readonly DenseGridRow[];
  label: string;
  /** The frame bar fact, for example "412 rows". */
  fact: string;
  status?: ReactNode;
}) {
  const gridColumns = useMemo(() => columns.map((key) => ({ key, label: key })), [columns]);
  const facts = useMemo(() => [fact, FILE_SIZE_FACT], [fact]);
  useFileViewerFacts(facts);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-slot="file-data-grid">
      <DenseGrid
        className="flex-1"
        columns={gridColumns}
        format={formatFileCell}
        label={label}
        rows={rows}
      />
      {status ? (
        <div
          className="flex h-7 shrink-0 items-center gap-3 overflow-hidden border-t border-border px-3.5 text-xs whitespace-nowrap text-faint"
          role="status"
        >
          {status}
        </div>
      ) : null}
    </div>
  );
}
