import Papa from 'papaparse';
import type { ClioDataRow } from './data-table';

export const csvPreviewRowLimit = 1_000;

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
    preview: csvPreviewRowLimit + 1,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });
  const rows = result.data.slice(0, csvPreviewRowLimit);
  const errors = result.errors
    .slice(0, 3)
    .map((error) => `${error.message}${error.row === undefined ? '' : ` (row ${error.row + 1})`}.`);
  return {
    columns: result.meta.fields ?? [],
    rows,
    errors,
    truncated: result.data.length > csvPreviewRowLimit || result.meta.truncated,
  };
}
