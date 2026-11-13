import { t } from '@lingui/core/macro';
import Papa from 'papaparse';
import { PREVIEW_ROW_LIMIT } from '@/lib/runtime-limits';
import type { ClioDataRow } from './data-table';

/** Parses a bounded, typed CSV sample for the shared data grid. */
export function parseCsvPreview(content: string): {
  columns: string[];
  rows: ClioDataRow[];
  errors: string[];
  truncated: boolean;
} {
  const result = Papa.parse<ClioDataRow>(content, {
    dynamicTyping: true,
    header: true,
    preview: PREVIEW_ROW_LIMIT + 1,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });
  const rows = result.data.slice(0, PREVIEW_ROW_LIMIT);
  const errors = result.errors.slice(0, 3).map((error) => {
    const message = error.message;
    if (error.row === undefined) return `${message}.`;
    const row = error.row + 1;
    return t`${message} (row ${row}).`;
  });
  return {
    columns: result.meta.fields ?? [],
    rows,
    errors,
    truncated: result.data.length > PREVIEW_ROW_LIMIT || result.meta.truncated,
  };
}
