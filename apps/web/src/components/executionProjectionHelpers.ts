/**
 * Small pure helpers (object access, coercion) shared by the
 * execution-projection model.
 */
import { stringValue as presentationStringValue } from '../presentationUtils.js';

export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Execution-projection variant of `stringValue` (cf. {@link import('../presentationUtils.js').stringValue}).
 *
 * It deliberately diverges from the presentation default: numbers and booleans
 * render with raw `String(value)` (full-precision coordinates such as
 * `center_lat`, and `true`/`false` rather than `yes`/`no`), and arrays/objects
 * collapse to an empty string. The presentation default instead rounds numbers
 * via `formatNumber`, humanizes booleans, and joins arrays — which would corrupt
 * the projection report copy. Both variants share the single
 * {@link presentationStringValue} implementation via its `rawScalar` option.
 */
export function stringValue(value: unknown): string {
  return presentationStringValue(value, { rawScalar: true });
}

export function isRedacted(text: string): boolean {
  return /\[redacted\]/i.test(text.trim());
}

export function agentDepth(agent: string): number {
  if (!agent || agent === 'main') return 0;
  if (['data', 'geospatial', 'analysis', 'visualization', 'synthesis'].includes(agent)) return 1;
  return 2;
}

export function handoffDepth(parent: string, agent: string): number {
  if (!parent || parent === 'main') return agent === 'main' ? 0 : 1;
  return agentDepth(parent) + 1;
}

export function toolDisplayName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('geocode')) return 'Geocode location';
  if (lower.startsWith('ndp_search')) return 'NDP catalog search';
  if (lower.startsWith('ndp_stage')) return 'NDP resource staging';
  if (lower === 'shell_bash') return 'Shell command';
  if (lower.includes('plot') || lower.includes('chart') || lower.includes('visual')) {
    return 'Plot timeseries';
  }
  return name;
}

export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

export function compactValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(compactValue).filter(Boolean).join(', ');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function imagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(path);
}

export function formatDistanceKm(value: string): string {
  if (!value) return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return parsed.toFixed(2).replace(/\.00$/, '');
}

export function redirectDestination(command: string): string {
  const parts = command.split('>');
  if (parts.length < 2) return '';
  return parts.at(-1)?.trim().replace(/^['"]|['"]$/g, '') ?? '';
}
