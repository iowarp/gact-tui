/**
 * Semantic previews for clio tool results (mirrors the TUI's
 * executionSpecificObservationPreview / firstCSVName / artifact-preview logic in
 * tui/internal/ui/execution_observations.go).
 *
 * A tool's `result` arrives as a STRING that is sometimes JSON
 * (`{"success":true,"columns":[…]}`), sometimes a Python-repr list
 * (`[{'display_name': …}]`), and sometimes a shell-exec envelope that merely
 * echoes the command back. Dumping that raw is noise. Here we try-parse it and
 * surface the MEANINGFUL content:
 *
 *   - geocode            → the resolved place + lat/lon
 *   - CSV profile        → columns + row/size
 *   - staged resource    → the local path + size
 *   - radius filter      → matched / total counts
 *   - dataset search     → how many datasets + the first title
 *   - shell command      → the OUTPUT (stdout/stderr), NOT the echoed command
 *   - plot / artifact    → the output file name (+ the image path, surfaced
 *                          separately for inline rendering)
 *
 * The preview is intentionally short (a few lines); the full raw result is kept
 * for the expand affordance.
 */

/** Result of analysing a tool result string. */
export interface ToolResultAnalysis {
  /** Short, human-readable semantic preview (never the raw command echo). */
  preview: string;
  /** The full, pretty-printed result body for the expand affordance. */
  full: string;
  /** When the result references an image artifact, its path (for inline render). */
  imagePath?: string;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

/** Parse a tool result that may be JSON or a Python-repr literal. Returns the
 *  parsed value, or undefined when it is plain text. */
export function parseToolResult(raw: string): unknown {
  const text = raw.trim();
  if (!text) return undefined;
  const first = text[0];
  if (first !== '{' && first !== '[') return undefined;
  // Direct JSON first.
  try {
    return JSON.parse(text);
  } catch {
    // fall through to python-repr coercion
  }
  // Python-repr → JSON: single→double quotes, True/False/None → JSON. This is a
  // best-effort coercion for clio results that are Python repr() output.
  try {
    const coerced = pythonReprToJson(text);
    return JSON.parse(coerced);
  } catch {
    return undefined;
  }
}

/** Best-effort Python-repr → JSON coercion (handles the shapes clio emits:
 *  dict/list of str/num/bool/None with single-quoted keys and values). */
function pythonReprToJson(src: string): string {
  let out = '';
  let inStr = false;
  let quote = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inStr) {
      if (c === '\\') {
        out += c + (src[i + 1] ?? '');
        i++;
        continue;
      }
      if (c === quote) {
        inStr = false;
        out += '"';
        continue;
      }
      // Escape a double-quote that appears inside a single-quoted string.
      out += c === '"' ? '\\"' : c;
      continue;
    }
    if (c === "'" || c === '"') {
      inStr = true;
      quote = c;
      out += '"';
      continue;
    }
    out += c;
  }
  // Replace Python literals only outside strings — do a token-boundary replace.
  return out
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null');
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function baseName(path: string): string {
  const cleaned = path.replace(/[/\\]+$/, '');
  const idx = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'));
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
}

function humanBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return `${n} B`;
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 10 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

/** Pretty-print a parsed value for the expand body; fall back to the raw text. */
function prettyFull(parsed: unknown, raw: string): string {
  if (parsed === undefined) return raw.trim();
  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw.trim();
  }
}

/**
 * Analyse a tool result into a semantic preview + full body + optional image
 * path. `name` is the tool name (used to specialise the preview).
 */
export function analyzeToolResult(name: string, raw: string): ToolResultAnalysis {
  const text = (raw ?? '').trim();
  if (!text) return { preview: '', full: '' };
  const parsed = parseToolResult(text);
  const full = prettyFull(parsed, text);

  // Unwrap clio's {"preview": "...", "truncated": …} envelope — the inner string
  // is itself a JSON result; analyse that instead.
  if (isRecord(parsed) && typeof parsed['preview'] === 'string' && 'truncated' in parsed) {
    const inner = analyzeToolResult(name, parsed['preview'] as string);
    return { ...inner, full };
  }

  const lower = name.toLowerCase();

  // --- shell: show OUTPUT, never the echoed command -------------------------
  if (isRecord(parsed) && ('stdout' in parsed || 'exit_code' in parsed)) {
    return { ...shellPreview(parsed), full };
  }

  // --- geocode: resolved place + coordinates --------------------------------
  if (lower.includes('geocode') || (Array.isArray(parsed) && firstHas(parsed, 'display_name'))) {
    const p = geocodePreview(parsed);
    if (p) return { preview: p, full };
  }

  // --- CSV profile: columns + rows + size -----------------------------------
  if (isRecord(parsed) && (Array.isArray(parsed['columns']) || 'column_count' in parsed)) {
    return { preview: csvProfilePreview(parsed), full };
  }

  // --- staged resource: local path + size -----------------------------------
  if (isRecord(parsed) && typeof parsed['local_path'] === 'string') {
    const size = typeof parsed['size_bytes'] === 'number' ? ` · ${humanBytes(parsed['size_bytes'])}` : '';
    return { preview: `staged ${baseName(parsed['local_path'])}${size}`, full };
  }

  // --- radius filter: matched / total ---------------------------------------
  if (isRecord(parsed) && ('within_radius_count' in parsed || 'count' in parsed) && 'total_points' in parsed) {
    const within = parsed['within_radius_count'] ?? parsed['count'];
    const radius = typeof parsed['radius_km'] === 'number' ? ` within ${parsed['radius_km']} km` : '';
    return { preview: `${within} of ${parsed['total_points']} points${radius}`, full };
  }

  // --- dataset search: count + first title ----------------------------------
  if (isRecord(parsed) && Array.isArray(parsed['datasets'])) {
    const ds = parsed['datasets'] as unknown[];
    const firstTitle = isRecord(ds[0])
      ? clip(str(ds[0]['title']) || str(ds[0]['name']), 48)
      : '';
    return {
      preview: `${ds.length} dataset${ds.length === 1 ? '' : 's'}${firstTitle ? ` · ${firstTitle}` : ''}`,
      full,
    };
  }

  // --- plot / artifact: output file (+ image path) --------------------------
  if (isRecord(parsed) && typeof parsed['output_path'] === 'string') {
    const out = parsed['output_path'];
    const title = str(parsed['title']);
    const pts = typeof parsed['data_points'] === 'number' ? ` · ${parsed['data_points']} points` : '';
    const analysis: ToolResultAnalysis = {
      preview: `${title ? title + ' — ' : ''}${baseName(out)}${pts}`,
      full,
    };
    if (IMAGE_EXT.test(out)) analysis.imagePath = out;
    return analysis;
  }

  // --- generic success object ------------------------------------------------
  if (isRecord(parsed)) {
    const status = str(parsed['status']) || (parsed['ok'] === true ? 'ok' : '') || (parsed['success'] === true ? 'success' : '');
    const path = typeof parsed['output_path'] === 'string' ? parsed['output_path'] : '';
    const summary = [status, path ? baseName(path) : ''].filter(Boolean).join(' · ');
    if (summary) return { preview: summary, full };
  }

  // --- plain / unrecognised: first lines of the raw text --------------------
  return { preview: firstLines(text, 6), full };
}

function shellPreview(parsed: Record<string, unknown>): { preview: string; imagePath?: string } {
  const stdout = str(parsed['stdout']);
  const stderr = str(parsed['stderr']);
  const exit = parsed['exit_code'];
  const body = stdout || stderr;
  if (body) return { preview: firstLines(body, 6) };
  // No output — report the exit status rather than echoing the command.
  return { preview: exit === 0 ? '(no output, exit 0)' : `exit ${exit}` };
}

function geocodePreview(parsed: unknown): string {
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!isRecord(first)) return '';
  const name = str(first['display_name']) || str(first['name']);
  const lat = first['lat'];
  const lon = first['lon'];
  const coords = lat != null && lon != null ? ` (${lat}, ${lon})` : '';
  return name ? `${clip(name, 70)}${coords}` : '';
}

function csvProfilePreview(parsed: Record<string, unknown>): string {
  const cols = Array.isArray(parsed['columns']) ? (parsed['columns'] as unknown[]) : [];
  const colCount = typeof parsed['column_count'] === 'number' ? parsed['column_count'] : cols.length;
  const rows = parsed['row_count'] ?? parsed['rows'] ?? parsed['num_rows'];
  const size = typeof parsed['size_bytes'] === 'number' ? humanBytes(parsed['size_bytes']) : '';
  const colList = cols.length ? clip(cols.map((c) => String(c)).join(', '), 80) : '';
  const meta = [
    `${colCount} columns`,
    rows != null ? `${rows} rows` : '',
    size,
  ].filter(Boolean).join(' · ');
  return colList ? `${meta}\n${colList}` : meta;
}

function firstLines(s: string, n: number): string {
  const lines = s.split('\n');
  return lines.slice(0, n).join('\n');
}

function firstHas(arr: unknown[], key: string): boolean {
  return arr.length > 0 && isRecord(arr[0]) && key in (arr[0] as Record<string, unknown>);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
