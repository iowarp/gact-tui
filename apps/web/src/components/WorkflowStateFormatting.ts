/**
 * Workflow State formatting helpers (pure).
 */
import { humanizeKey, shortScalar as shortScalarBase } from '../presentationUtils.js';
import type { WorkflowRow } from './WorkflowStateModel.js';

export { humanizeKey };

/** Workflow-state scalars cap strings at 90 chars and render coordinates with `toFixed(4)`. */
export function shortScalar(value: unknown): string {
  return shortScalarBase(value, {
    maxLen: 90,
    formatNumber: (n) => (Number.isInteger(n) ? String(n) : n.toFixed(4)),
  });
}

export function summarizeEvidenceRecord(record: Record<string, unknown>): string {
  const region = shortScalar(record['REGION_LABEL'] ?? record['region_label'] ?? record['region_name']);
  const confidence = shortScalar(record['CONFIDENCE'] ?? record['confidence']);
  const lat = shortScalar(record['CENTER_LAT'] ?? record['center_lat']);
  const lon = shortScalar(record['CENTER_LON'] ?? record['center_lon']);
  const radius = shortScalar(record['RADIUS_KM'] ?? record['radius_km']);
  const warnings = shortScalar(record['WARNINGS'] ?? record['warnings']);
  if (region) {
    const bits = [
      `Resolved region: ${region}`,
      lat && lon ? `center ${lat}, ${lon}` : '',
      radius ? `radius ${radius} km` : '',
      confidence ? `confidence ${confidence}` : '',
      warnings ? `warnings ${warnings}` : '',
    ].filter(Boolean);
    return bits.join(' · ');
  }

  const bits = Object.entries(record)
    .filter(([, value]) => value != null && value !== '')
    .slice(0, 4)
    .map(([key, value]) => `${humanizeKey(key)}: ${shortScalar(value)}`)
    .filter((bit) => !bit.endsWith(': '));
  return bits.join(' · ');
}

export function workflowTone(
  status: string,
  value: Record<string, unknown>,
): WorkflowRow['tone'] {
  const text = `${status} ${String(value['blocker'] ?? '')} ${String(value['error'] ?? '')}`.toLowerCase();
  if (/fail|error|blocked|missing|invalid/.test(text)) return 'err';
  if (/warn|partial|preliminary|metadata|scan_limited|unknown/.test(text)) return 'warn';
  if (/ready|complete|completed|staged|resolved|ranked|selected|ok|true/.test(text)) return 'ok';
  return 'idle';
}

export function workflowDetail(value: Record<string, unknown>): string {
  const knownBlocker = knownWorkflowBlocker(value);
  if (knownBlocker) return knownBlocker;

  const keys = [
    'failed_child',
    'parent',
    'message',
    'path',
    'local_path',
    'metadata_path',
    'source_url',
    'region_name',
    'station_id',
    'candidate_count',
    'size_bytes',
    'blocker',
    'error',
    'warning',
    'warnings',
    'next_action',
  ];
  const bits: string[] = [];
  for (const key of keys) {
    const raw = value[key];
    if (raw == null || raw === '') continue;
    const formatted = Array.isArray(raw)
      ? raw.slice(0, 3).map(shortScalar).join(', ')
      : shortScalar(raw);
    if (formatted) bits.push(`${humanizeKey(key)}: ${formatted}`);
    if (bits.length >= 3) break;
  }
  return bits.join(' · ');
}

export function knownWorkflowBlocker(value: Record<string, unknown>): string {
  const error = String(value['error'] ?? '');
  if (error !== '_UnsupportedSessionAgent') return '';

  const child = shortScalar(value['failed_child'] ?? value['message']);
  const parent = shortScalar(value['parent']);
  const bits = [
    child ? `child expert: ${child}` : '',
    parent ? `parent: ${parent}` : '',
    'reason: required tools are not available in this session',
  ].filter(Boolean);
  return bits.join(' · ');
}
