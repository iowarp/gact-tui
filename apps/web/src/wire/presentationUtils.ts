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
 * - The execution-projection variant passes `rawScalar: true` to render
 *   numbers/booleans with full-precision
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

/** Detects a filesystem-path-like string (a `/` or `\` separator) — never a
 *  heuristic on prose content, purely structural. Used to decide whether a
 *  value earns path-aware middle-elision ({@link elidePathMiddle}) instead
 *  of the ordinary scalar truncate. */
export function looksLikePath(value: string): boolean {
  return /[\\/]/.test(value);
}

/**
 * Middle-elides a long path so BOTH meaningful ends always survive: the
 * drive/first segment (WHERE it starts) and the basename (WHAT it is) —
 * `truncate`'s head-only ellipsis instead chews the basename away first,
 * leaving something like `D:/some/very/long/prefix/tha...` with no filename
 * at all (owner finding, gact-tui live session: a collapsed tool-call args
 * hint did exactly this). One shared helper for every path-like arg,
 * everywhere a path renders as a short identity hint — never a bespoke
 * truncate per call site. Backslashes normalize to forward slashes for
 * display only (the wire's own raw Windows paths elsewhere are untouched).
 * A path at or under `maxLen` passes through unchanged; a basename that
 * alone still overflows the budget is truncated from ITS tail (a rare,
 * pathological case) rather than ever giving up the head+ellipsis skeleton.
 */
export function elidePathMiddle(path: string, maxLen = 44): string {
  const norm = path.replace(/\\/g, '/');
  if (norm.length <= maxLen) return norm;
  const segments = norm.split('/').filter(Boolean);
  const basename = segments[segments.length - 1] ?? norm;
  if (segments.length <= 1) return truncate(norm, maxLen);
  const head = segments[0] ?? '';
  const prefix = norm.startsWith('/') ? `/${head}` : head;
  const skeleton = `${prefix}/\u2026/`;
  const budget = maxLen - skeleton.length;
  const shownBasename = budget > 3 && basename.length > budget ? truncate(basename, budget) : basename;
  return `${skeleton}${shownBasename}`;
}
