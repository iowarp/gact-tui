export interface StructuredResultPresentation {
  title: string;
  rows: Array<{ label: string; value: string }>;
  raw: string;
}

export function summarizeToolResultPresentation(
  toolName: string | undefined,
  rawText: string,
): StructuredResultPresentation | null {
  const raw = rawText.trim();
  if (!raw) return null;
  const parsed = parseLeadingJson(raw);
  if (!parsed || !isRecord(parsed.value)) return null;
  const result = parsed.value;
  const rows: Array<{ label: string; value: string }> = [];

  const error = isRecord(result.error) ? result.error : null;
  if (error) {
    addFirst(rows, 'code', error, ['code', 'type', 'error']);
    addFirst(rows, 'message', error, ['message', 'error']);
    addFirst(rows, 'next action', error, ['next_action', 'recovery']);
    addFirst(rows, 'path', error, ['path', 'filepath', 'file']);
    return rows.length
      ? { title: 'error result', rows, raw: parsed.raw }
      : null;
  }

  addFirst(rows, 'status', result, ['status', 'state']);
  if (isRecord(result._meta)) addFirst(rows, 'status', result._meta, ['status', 'state']);

  const shellRows = shellResultRows(result);
  if (shellRows.length) {
    return { title: 'command result', rows: [...rows, ...shellRows], raw: parsed.raw };
  }

  const datasetRows = ndpDatasetRows(result);
  if (datasetRows.length) {
    return { title: 'catalog result', rows: [...rows, ...datasetRows], raw: parsed.raw };
  }

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
  if (records.length) {
    const declaredCount = firstNumber(result, ['count', 'record_count', 'feature_count', 'total', 'total_count']);
    rows.push({ label: 'records', value: String(declaredCount ?? records.length) });
    for (const item of records.slice(0, 4)) {
      rows.push({ label: 'sample', value: summarizeRecordItem(item) });
    }
    if (records.length > 4) rows.push({ label: 'more', value: `${records.length - 4} more` });
    addArtifact(rows, result);
    return { title: 'records result', rows, raw: parsed.raw };
  }

  addFirst(rows, 'scope', result, ['region', 'region_name', 'name', 'label', 'title']);
  const location = coordinateScope(result);
  if (location) rows.push({ label: 'location', value: location });
  const counts = evidenceCounts(result);
  if (counts) rows.push({ label: 'counts', value: counts });
  addFirst(rows, 'summary', result, ['summary', 'message', 'description']);
  addArtifact(rows, result);

  if (!rows.length) {
    const generic = genericRows(result);
    if (!generic.length) return null;
    rows.push(...generic);
  }
  return {
    title: resultTitle(toolName, result),
    rows,
    raw: parsed.raw,
  };
}

export function toolInputRows(input: Record<string, unknown> | undefined): Array<{ label: string; value: string }> {
  if (!input) return [];
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 8)
    .map(([key, value]) => ({ label: humanizeKey(key), value: shortScalar(value) }));
}

function parseLeadingJson(text: string): { value: unknown; raw: string } | null {
  const start = text.search(/[\[{]/);
  if (start < 0) return null;
  const end = findBalancedJsonEnd(text, start);
  if (end < 0) return null;
  const raw = text.slice(start, end + 1);
  try {
    return { value: JSON.parse(raw), raw };
  } catch {
    return null;
  }
}

function findBalancedJsonEnd(text: string, start: number): number {
  const open = text[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = inString;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function shellResultRows(result: Record<string, unknown>): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const exitCode = firstNumber(result, ['exit_code', 'code']);
  if (exitCode !== undefined) rows.push({ label: 'exit code', value: String(exitCode) });
  for (const key of ['stdout', 'stderr', 'error']) {
    const value = stringValue(result[key]);
    if (value) rows.push({ label: key, value: truncate(value.replace(/\s+/g, ' '), 260) });
  }
  return rows;
}

function ndpDatasetRows(result: Record<string, unknown>): Array<{ label: string; value: string }> {
  const datasets = isRecord(result.datasets) ? firstItems(result.datasets, ['items']) : [];
  if (!datasets.length) return [];
  const rows: Array<{ label: string; value: string }> = [];
  const count = firstNumber(result.datasets as Record<string, unknown>, ['count']) ?? datasets.length;
  rows.push({ label: 'datasets', value: String(count) });
  for (const item of datasets.slice(0, 4)) rows.push({ label: 'sample', value: summarizeRecordItem(item) });
  if (datasets.length > 4) rows.push({ label: 'more', value: `${datasets.length - 4} more` });
  return rows;
}

function genericRows(result: Record<string, unknown>): Array<{ label: string; value: string }> {
  return Object.entries(result)
    .filter(([key, value]) => !genericNoiseKey(key) && value !== undefined && value !== null && value !== '')
    .slice(0, 5)
    .map(([key, value]) => ({ label: humanizeKey(key), value: shortScalar(value) }));
}

function genericNoiseKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower === '_meta' || lower === 'raw' || lower.includes('metadata_source_url');
}

function addFirst(
  rows: Array<{ label: string; value: string }>,
  label: string,
  record: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (!value) continue;
    rows.push({ label, value: truncate(value.replace(/\s+/g, ' '), 260) });
    return;
  }
}

function addArtifact(rows: Array<{ label: string; value: string }>, result: Record<string, unknown>) {
  addFirst(rows, 'artifact', result, ['output_path', 'artifact_path', 'artifact', 'path', 'file', 'file_path', 'filepath']);
}

function coordinateScope(result: Record<string, unknown>): string {
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

function evidenceCounts(result: Record<string, unknown>): string {
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

function resultTitle(toolName: string | undefined, result: Record<string, unknown>): string {
  const tool = (toolName ?? '').toLowerCase();
  if (tool.includes('shell') || tool.includes('bash') || tool.includes('command')) return 'command result';
  if (tool.includes('plot') || tool.includes('visual') || stringValue(result.artifact_path) || stringValue(result.output_path)) {
    return 'artifact result';
  }
  return 'structured result';
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return '';
}

function firstNumber(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.slice(0, 4).map(shortScalar).join(', ');
  return '';
}

function shortScalar(value: unknown): string {
  if (typeof value === 'string') return truncate(value.replace(/\s+/g, ' ').trim(), 120);
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.slice(0, 4).map(shortScalar).join(', ');
  if (isRecord(value)) return 'recorded';
  return value == null ? '' : truncate(String(value), 120);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : Number(value.toPrecision(5)).toString();
}

function humanizeKey(key: string): string {
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
