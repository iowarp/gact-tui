/**
 * Shared presentation primitives: type guards, key humanisation, scalar
 * shortening, and leading-JSON parsing.
 */
export function findBalancedJsonEnd(text: string, start: number): number {
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

/**
 * Options that let {@link stringValue} serve two documented variants from a
 * single implementation:
 *
 * - The presentation default rounds numbers via {@link formatNumber}, humanizes
 *   booleans (`yes`/`no`), and joins the first four array entries.
 * - The execution-projection variant
 *   ({@link import('./components/executionProjectionHelpers.js').stringValue})
 *   passes `rawScalar: true` to render numbers/booleans with full-precision
 *   `String(value)` (full-precision numbers, `true`/`false`) and collapses
 *   arrays/objects to an empty string, which the report copy relies on.
 */
export interface StringValueOptions {
  rawScalar?: boolean;
}

export function stringValue(value: unknown, options: StringValueOptions = {}): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (options.rawScalar) {
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
  }
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.slice(0, 4).map((item) => shortScalar(item)).join(', ');
  return '';
}

/** Collapses runs of whitespace to a single space and trims the ends. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Maps a status string to a UI tone via a small lookup table, returning
 * `fallback` for unknown/empty statuses. Replaces the per-page `xStatusTone`
 * if-chains (health, LSP, MCP server) with one shared, table-driven helper.
 */
export function statusTone<T extends string>(
  status: string | undefined,
  mapping: Readonly<Record<string, T>>,
  fallback: T,
): T {
  if (!status) return fallback;
  return mapping[status] ?? fallback;
}

/** Compact human byte size (B / KB / MB / GB). `undefined` renders as `''`. */
export function humanSize(size: number | undefined): string {
  if (size == null) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Compact human count: `1.23k` for [1000, 10000), `12.3k` for ≥ 10000, raw
 * below 1000. Shared by the token-budget chips and the run inspector.
 */
export function humanNum(n: number): string {
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  return n.toString();
}

/**
 * Options that let a call site preserve its own scalar-formatting behaviour while
 * still sharing this single implementation.
 *
 * - `maxLen` caps string (and `String(value)` fallback) length. Defaults to 120.
 * - `formatNumber` controls non-integer number rendering. Defaults to the
 *   precision-5 {@link formatNumber}; `WorkflowStateFormatting` passes a
 *   `toFixed(4)` variant to keep its coordinate output identical.
 */
export interface ShortScalarOptions {
  maxLen?: number;
  formatNumber?: (value: number) => string;
}

export function shortScalar(value: unknown, options: ShortScalarOptions = {}): string {
  const maxLen = options.maxLen ?? 120;
  const numberFormat = options.formatNumber ?? formatNumber;
  if (typeof value === 'string') return truncate(normalizeWhitespace(value), maxLen);
  if (typeof value === 'number') return numberFormat(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.slice(0, 4).map((item) => shortScalar(item, options)).join(', ');
  if (isRecord(value)) return 'recorded';
  return value == null ? '' : truncate(String(value), maxLen);
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : Number(value.toPrecision(5)).toString();
}

export function humanizeKey(key: string): string {
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
