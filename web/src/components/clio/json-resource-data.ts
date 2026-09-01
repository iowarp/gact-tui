import { JSON_TABLE_ROW_LIMIT } from '@/lib/runtime-limits';
import type { ClioDataRow } from './data-table';

export interface TabularJsonDataset {
  columns: string[];
  label: string;
  rows: ClioDataRow[];
  totalRows: number;
}

/** Extracts a complete homogeneous record collection without silently dropping JSON values. */
export function tabularJsonDataset(content: string, title: string): TabularJsonDataset | undefined {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return undefined;
  }

  let label = title;
  let records: ClioDataRow[] | undefined;
  if (isTabularRecordArray(value)) {
    records = value;
  } else if (isRecord(value)) {
    const entry = Object.entries(value).find(([, candidate]) => isTabularRecordArray(candidate));
    if (entry && isTabularRecordArray(entry[1])) {
      label = entry[0];
      records = entry[1];
    }
  }
  if (!records) return undefined;

  const rows = records.slice(0, JSON_TABLE_ROW_LIMIT);
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort(compareColumns);
  if (!columns.length) return undefined;
  return { columns, label, rows, totalRows: records.length };
}

function compareColumns(left: string, right: string): number {
  return columnPriority(left) - columnPriority(right);
}

function columnPriority(column: string): number {
  const normalized = column.toLowerCase();
  if (normalized === 'id' || normalized.endsWith('_id')) return 0;
  if (normalized === 'name' || normalized.endsWith('_name')) return 1;
  if (normalized === 'status' || normalized.endsWith('_status')) return 2;
  if (
    normalized.includes('timestamp') ||
    normalized.endsWith('_time') ||
    normalized.endsWith('_date')
  )
    return 3;
  return 4;
}

function isRecord(value: unknown): value is ClioDataRow {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTabularRecordArray(value: unknown): value is ClioDataRow[] {
  return Array.isArray(value) && value.length > 0 && value.every(isRecord);
}
