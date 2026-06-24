/**
 * Renders a compact, truncated preview of a tool observation for the
 * execution trace.
 */
import {
  basename,
  formatDistanceKm,
  isRedacted,
  objectValue,
  redirectDestination,
  stringValue,
} from './executionProjectionHelpers.js';

export function observationPreview(toolName: string, raw: unknown): string {
  const specific = specificObservationPreview(toolName, raw);
  if (specific) return specific;
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  if (!text || isRedacted(text) || /^(completed|done|ok)$/i.test(text.trim())) return '';
  if (/geocode/i.test(toolName)) {
    const name = /display_name['"]?\s*:\s*['"]([^'"]+)/.exec(text)?.[1];
    const lat = /lat['"]?\s*:\s*([-\d.]+)/.exec(text)?.[1];
    const lon = /lon['"]?\s*:\s*([-\d.]+)/.exec(text)?.[1];
    return [name, lat && lon ? `center ${lat}, ${lon}` : ''].filter(Boolean).join('\n');
  }
  const csv = /[\w.-]+\.csv\b/.exec(text)?.[0];
  if (/ndp_search/i.test(toolName) && csv) return csv;
  if (/local_path/.test(text)) {
    const path = /"local_path"\s*:\s*"([^"]+)"/.exec(text)?.[1];
    const size = /"size_bytes"\s*:\s*(\d+)/.exec(text)?.[1];
    return [path, size ? `${size} bytes` : ''].filter(Boolean).join(' · ');
  }
  return text.length > 240 ? `${text.slice(0, 240)}…\nshow full output` : text;
}

function specificObservationPreview(toolName: string, raw: unknown): string {
  const obj = objectValue(raw);
  const lower = toolName.toLowerCase();
  if (lower.includes('filter_points') || lower.includes('points_by_radius')) {
    const points = Array.isArray(obj['points']) ? obj['points'] : [];
    const rows = [
      stringValue(obj['within_radius_count']) || stringValue(obj['count'])
        ? `${stringValue(obj['within_radius_count']) || stringValue(obj['count'])} stations within radius`
        : '',
      ...points.slice(0, 3).map((rawPoint) => {
        const point = objectValue(rawPoint);
        const id = stringValue(point['Site']) || stringValue(point['site']) || stringValue(point['station']) || stringValue(point['id']);
        const distance = formatDistanceKm(stringValue(point['distance_km']) || stringValue(point['distance']));
        return id ? `${id}${distance ? ` ${distance} km` : ''}` : '';
      }),
      points.length > 3 ? 'show full output' : '',
    ].filter(Boolean);
    return rows.join('\n');
  }
  if (lower.startsWith('ndp_stage')) {
    const path = stringValue(obj['local_path']) || stringValue(obj['path']) || stringValue(obj['output_path']) || stringValue(obj['artifact_path']);
    if (!path) return '';
    const size = stringValue(obj['size_bytes']) || stringValue(obj['bytes']);
    return `${basename(path)}${size ? ` · ${size} bytes` : ''}`;
  }
  if (lower === 'shell_bash') {
    const command = stringValue(obj['command']);
    const dst = redirectDestination(command);
    if (dst) return `prepared ${basename(dst)}`;
  }
  if (lower.includes('plot') || lower.includes('chart') || lower.includes('visual')) {
    const path = stringValue(obj['output_path']) || stringValue(obj['artifact_path']) || stringValue(obj['path']) || stringValue(obj['file_path']);
    if (!path) return '';
    return [
      path,
      stringValue(obj['plot_type']) ? `chart ${stringValue(obj['plot_type'])}` : '',
      stringValue(obj['x_column']) ? `x ${stringValue(obj['x_column'])}` : '',
      Array.isArray(obj['y_columns']) ? `y ${obj['y_columns'].join(', ')}` : '',
      stringValue(obj['data_points']) ? `${stringValue(obj['data_points'])} rows` : '',
    ].filter(Boolean).join('\n');
  }
  return '';
}
