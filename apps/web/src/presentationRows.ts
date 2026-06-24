/**
 * Builds presentation rows from tool-result payloads — record/dataset
 * collections, shell command output, and generic scalar objects.
 *
 * Consolidates the former `presentationRecordRows.ts` + `presentationResultRows.ts`
 * over two shared primitives: {@link buildRow} (the `{label, value}` shape) and
 * {@link sampledItems} (the "count + bounded samples + more" pattern that the
 * dataset and record summaries both used). Behaviour is identical to the two
 * source modules — same keys, same caps, same ordering.
 */
import {
  firstNumber,
  formatNumber,
  humanizeKey,
  isRecord,
  shortScalar,
  stringValue,
  truncate,
} from './presentationUtils.js';

export interface PresentationRow {
  label: string;
  value: string;
}

/** Single `{label, value}` presentation row. */
export function buildRow(label: string, value: string): PresentationRow {
  return { label, value };
}

/**
 * The shared "collection" summary: a leading count row, up to four summarized
 * sample rows, and a trailing `N more` row when the collection is longer. The
 * caller supplies the count's label/value and a per-item summarizer.
 */
function sampledItems(
  countLabel: string,
  countValue: number,
  items: unknown[],
  summarize: (item: unknown) => string,
): PresentationRow[] {
  const rows: PresentationRow[] = [buildRow(countLabel, String(countValue))];
  for (const item of items.slice(0, 4)) rows.push(buildRow('sample', summarize(item)));
  if (items.length > 4) rows.push(buildRow('more', `${items.length - 4} more`));
  return rows;
}

export function datasetRows(result: Record<string, unknown>): PresentationRow[] {
  const datasets = isRecord(result.datasets) ? firstItems(result.datasets, ['items']) : [];
  if (!datasets.length) return [];
  const count = firstNumber(result.datasets as Record<string, unknown>, ['count']) ?? datasets.length;
  return sampledItems('datasets', count, datasets, summarizeRecordItem);
}

export function recordRows(result: Record<string, unknown>): PresentationRow[] {
  const records = firstItems(result, [
    'features',
    'records',
    'items',
    'results',
    'warnings',
    'events',
    'points',
    'matches',
    'matched',
    'stations',
    'candidates',
  ]);
  if (!records.length) return [];
  const declaredCount = firstNumber(result, ['count', 'record_count', 'feature_count', 'total', 'total_count']);
  return sampledItems('records', declaredCount ?? records.length, records, summarizeRecordItem);
}

function firstItems(record: Record<string, unknown>, keys: readonly string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (isRecord(value)) {
      if (Array.isArray(value.items)) return value.items;
      if (Array.isArray(value.records)) return value.records;
      if (Array.isArray(value.features)) return value.features;
    }
  }
  return [];
}

function summarizeRecordItem(item: unknown): string {
  if (!isRecord(item)) return shortScalar(item);
  const fields = isRecord(item.attributes) ? { ...item, ...item.attributes } : item;
  const name = firstString(fields, ['station', 'station_id', 'site', 'site_id', 'id', 'name', 'title', 'IncidentName', 'areaDesc']) || '(unnamed)';
  const bits: string[] = [];
  for (const [label, keys] of [
    ['status', ['status', 'Status', 'incident_status']],
    ['severity', ['severity', 'Severity', 'significance']],
    ['distance', ['distance_km', 'distance']],
    ['area', ['area', 'Area', 'county', 'County', 'zone', 'Zone']],
  ] as const) {
    const value = firstString(fields, keys);
    if (value) bits.push(`${label}: ${value}`);
    if (bits.length >= 3) break;
  }
  return bits.length ? `${name} · ${bits.join(' · ')}` : name;
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return '';
}

export function shellRows(result: Record<string, unknown>): PresentationRow[] {
  const rows: PresentationRow[] = [];
  const exitCode = firstNumber(result, ['exit_code', 'code']);
  if (exitCode !== undefined) rows.push(buildRow('exit code', String(exitCode)));
  for (const key of ['stdout', 'stderr', 'error']) {
    const value = stringValue(result[key]);
    if (value) rows.push(buildRow(key, truncate(value.replace(/\s+/g, ' '), 260)));
  }
  return rows;
}

export function genericRows(result: Record<string, unknown>): PresentationRow[] {
  return Object.entries(result)
    .filter(([key, value]) => !genericNoiseKey(key) && value !== undefined && value !== null && value !== '')
    .slice(0, 5)
    .map(([key, value]) => buildRow(humanizeKey(key), shortScalar(value)));
}

function genericNoiseKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower === '_meta' || lower === 'raw' || lower.includes('metadata_source_url');
}

export function addFirst(
  rows: PresentationRow[],
  label: string,
  record: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (!value) continue;
    rows.push(buildRow(label, truncate(value.replace(/\s+/g, ' '), 260)));
    return;
  }
}

export function addArtifact(rows: PresentationRow[], result: Record<string, unknown>) {
  addFirst(rows, 'artifact', result, ['output_path', 'artifact_path', 'artifact', 'path', 'file', 'file_path', 'filepath']);
}

export function coordinateScope(result: Record<string, unknown>): string {
  const center = isRecord(result.center)
    ? coordinatePair(result.center, ['lat', 'latitude', 'center_lat'], ['lon', 'lng', 'longitude', 'center_lon'])
    : coordinatePair(result, ['center_lat', 'lat', 'latitude'], ['center_lon', 'lon', 'lng', 'longitude']);
  const radius = firstNumber(result, ['radius_km', 'radius', 'search_radius_km']);
  if (!center && radius === undefined) return '';
  if (!center) return `radius ${radius} km`;
  if (radius !== undefined) return `${center} · radius ${radius} km`;
  return center;
}

function coordinatePair(record: Record<string, unknown>, latKeys: string[], lonKeys: string[]): string {
  const lat = firstNumber(record, latKeys);
  const lon = firstNumber(record, lonKeys);
  return lat !== undefined && lon !== undefined ? `${formatNumber(lat)}, ${formatNumber(lon)}` : '';
}

export function evidenceCounts(result: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [label, keys] of [
    ['input', ['input_count', 'source_count', 'total_count', 'total']],
    ['matched', ['matched_count', 'filtered_count', 'match_count']],
    ['records', ['count', 'record_count', 'feature_count', 'point_count']],
    ['rows', ['rows', 'row_count']],
  ] as const) {
    const value = firstNumber(result, keys);
    if (value !== undefined) parts.push(`${label}: ${formatNumber(value)}`);
  }
  return parts.join(' · ');
}

export function resultTitle(toolName: string | undefined, result: Record<string, unknown>): string {
  const tool = (toolName ?? '').toLowerCase();
  if (tool.includes('shell') || tool.includes('bash') || tool.includes('command')) return 'command result';
  if (tool.includes('plot') || tool.includes('visual') || stringValue(result.artifact_path) || stringValue(result.output_path)) {
    return 'artifact result';
  }
  return 'structured result';
}
