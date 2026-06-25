/**
 * BACKEND-AGNOSTIC tool-result content-type detection.
 *
 * GACT is a GENERIC client for ANY backend (contract/SPEC.md). A tool result is
 * rendered by WHAT THE CONTENT IS, never by the tool's NAME. This module looks
 * at a parsed result value and classifies it into one of a small, EXTENSIBLE set
 * of content types; the renderer then picks a view per type. No tool name,
 * expert name, or backend-specific workflow vocabulary appears here.
 *
 * Content types (mirrors the TUI's content-type previews in
 * tui/internal/ui/execution_observations.go + render_previews.go):
 *
 *   - image      an image Part, or a path/output_path with an image extension
 *   - diff       a `unified_diff` field, or a body that looks like a unified diff
 *   - table      a profile carrying `columns[]` (+ optional sample rows), or a
 *                header line + delimited rows (CSV / TSV)
 *   - markdown   prose text (rendered as markdown)
 *   - json       a structured object/array — show the backend `preview` or key
 *                fields
 *   - text       anything else — plain text
 *
 * The single contract-level affordance this honours is the backend-provided
 * `result.preview` envelope ({"preview": <string>, "truncated": bool}): when a
 * result carries a `preview` string, that string is the backend's own rendering
 * and is detected/rendered directly (after recursing into it for its own
 * content type).
 */

import { findBalancedJsonEnd, isRecord } from '../presentationUtils.js';

/** A column descriptor for a tabular result. */
export interface TableColumn {
  name: string;
  /** Optional per-column type/dtype the backend reported (display only). */
  dtype?: string;
}

/** Detected content type + the data the renderer needs for that type. */
export type ToolResultContent =
  | { kind: 'image'; path: string }
  | { kind: 'diff'; diff: string }
  | { kind: 'table'; columns: TableColumn[]; rows: string[][]; rowCount?: number; note?: string }
  | { kind: 'markdown'; text: string }
  | { kind: 'json'; preview: string; full: string }
  | { kind: 'text'; text: string };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/i;

/** True when `path` ends in a known image extension. */
export function isImagePath(path: string): boolean {
  return IMAGE_EXT.test(path.trim());
}

/**
 * Parse a result that may be JSON or a Python-repr literal. Returns the parsed
 * value, or undefined when it is plain text. Backends sometimes serialize
 * structured results as Python `repr()` (single quotes, True/False/None); this
 * is a best-effort coercion to recover the structure for content detection.
 */
export function parseStructured(raw: string): unknown {
  const text = raw.trim();
  if (!text) return undefined;
  const first = text[0];
  if (first !== '{' && first !== '[') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // fall through to python-repr coercion
  }
  try {
    return JSON.parse(pythonReprToJson(text));
  } catch {
    return undefined;
  }
}

/** Best-effort Python-repr → JSON coercion (dict/list of str/num/bool/None with
 *  single-quoted keys/values). String-aware so quotes inside strings survive. */
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
  return out
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null');
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function prettyJson(value: unknown, raw: string): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return raw.trim();
  }
}

/** A line that has the @@/+/-/space shape of a unified diff. */
function looksLikeUnifiedDiff(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^(---|\+\+\+)\s/m.test(t) && /^@@ /m.test(t)) return true;
  if (/^@@ .* @@/m.test(t)) return true;
  return false;
}

/**
 * Detect tabular text: a header row + at least one data row sharing the same
 * delimiter (comma or tab), with a consistent column count. Returns null when
 * the text is not convincingly a table.
 */
function detectDelimitedTable(text: string): ToolResultContent | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  for (const delim of [',', '\t']) {
    const header = lines[0]!.split(delim);
    if (header.length < 2) continue;
    const dataLines = lines.slice(1, 50);
    const consistent = dataLines.filter((l) => l.split(delim).length === header.length);
    // Need most data rows to match the header's column count to call it a table.
    if (consistent.length >= Math.max(1, Math.floor(dataLines.length * 0.6))) {
      const columns: TableColumn[] = header.map((h) => ({ name: h.trim() }));
      const rows = consistent.slice(0, 3).map((l) => l.split(delim).map((c) => c.trim()));
      return { kind: 'table', columns, rows, rowCount: lines.length - 1 };
    }
  }
  return null;
}

/** Build a table from a profile object that carries a `columns[]` array (and
 *  optional dtypes / row_count / sample rows). */
function tableFromProfile(obj: Record<string, unknown>): ToolResultContent | null {
  const rawCols = obj['columns'];
  if (!Array.isArray(rawCols) || rawCols.length === 0) return null;
  const dtypes = isRecord(obj['dtypes']) ? (obj['dtypes'] as Record<string, unknown>) : undefined;
  const columns: TableColumn[] = rawCols.map((c) => {
    const name = typeof c === 'string' ? c : str((c as Record<string, unknown>)?.['name']) || String(c);
    const dtype = dtypes ? str(dtypes[name]) : '';
    return dtype ? { name, dtype } : { name };
  });

  // Sample rows: prefer an explicit array-of-records (`sample`/`rows`/`head`/
  // `preview_rows`), projected onto the column order.
  const rows: string[][] = [];
  for (const key of ['sample', 'sample_rows', 'rows', 'head', 'preview_rows', 'records']) {
    const sample = obj[key];
    if (Array.isArray(sample) && sample.length && isRecord(sample[0])) {
      for (const r of sample.slice(0, 3)) {
        if (!isRecord(r)) continue;
        rows.push(columns.map((col) => scalarCell((r as Record<string, unknown>)[col.name])));
      }
      break;
    }
  }

  const rowCountRaw = obj['row_count'] ?? obj['rows'] ?? obj['num_rows'];
  const rowCount = typeof rowCountRaw === 'number' ? rowCountRaw : undefined;
  const out: ToolResultContent = { kind: 'table', columns, rows };
  if (rowCount !== undefined) out.rowCount = rowCount;
  return out;
}

function scalarCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Find an image-bearing path anywhere in a structured object (generic keys
 *  only — `output_path` / `path` / `file_path` / `artifact_path` / `url`). */
function imagePathFromObject(obj: Record<string, unknown>): string {
  for (const key of ['output_path', 'path', 'file_path', 'artifact_path', 'image_path', 'url']) {
    const v = str(obj[key]);
    if (v && isImagePath(v)) return v;
  }
  return '';
}

/**
 * A compact one-line "key: value" summary of a structured object — generic, no
 * special keys. Honours a backend-provided `preview` string first. Used for the
 * `json` content type's collapsed line.
 */
function structuredPreview(value: unknown): string {
  if (Array.isArray(value)) {
    const n = value.length;
    const head = isRecord(value[0]) ? Object.keys(value[0] as Record<string, unknown>).length : 0;
    return n === 1
      ? `1 item${head ? ` · ${head} fields` : ''}`
      : `${n} items`;
  }
  if (!isRecord(value)) return clip(String(value), 200);
  const obj = value as Record<string, unknown>;
  const preview = str(obj['preview']);
  if (preview) return clip(preview.replace(/\s+/g, ' '), 200);
  // Otherwise summarise scalar fields generically.
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === 'object') continue;
    parts.push(`${k}: ${clip(String(v), 48)}`);
    if (parts.length >= 5) break;
  }
  return parts.length ? clip(parts.join(' · '), 240) : `${Object.keys(obj).length} fields`;
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/**
 * Unwrap the backend `preview` envelope: a result of the shape
 * `{"preview": <string>, "truncated": bool}` carries the backend's OWN rendering
 * in `preview`. Returns the inner string when the envelope is present, else null.
 */
function unwrapPreviewEnvelope(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const preview = value['preview'];
  if (typeof preview !== 'string') return null;
  // Only treat it as an envelope when `truncated` accompanies it, or the preview
  // is itself a JSON-ish body — otherwise `preview` is just a normal field.
  if ('truncated' in value || /^\s*[[{]/.test(preview)) return preview;
  return null;
}

/**
 * Classify a tool result body into a content type. `raw` is the result string
 * (already coerced from object/string by the caller). This is the single
 * backend-agnostic entry point used by both render paths.
 */
export function detectToolResultContent(raw: string): ToolResultContent {
  const text = (raw ?? '').trim();
  if (!text) return { kind: 'text', text: '' };

  const parsed = parseStructured(text);

  // 1) Backend preview envelope: recurse into the backend's own rendering.
  const envelope = unwrapPreviewEnvelope(parsed);
  if (envelope !== null && envelope.trim() !== text) {
    return detectToolResultContent(envelope);
  }

  // 2) Structured object/array.
  if (parsed !== undefined && (isRecord(parsed) || Array.isArray(parsed))) {
    if (isRecord(parsed)) {
      const obj = parsed as Record<string, unknown>;

      // DIFF: an explicit unified_diff field.
      const diffField = str(obj['unified_diff']) || str(obj['diff']);
      if (diffField && looksLikeUnifiedDiff(diffField)) {
        return { kind: 'diff', diff: diffField };
      }

      // IMAGE: a path/output_path with an image extension.
      const img = imagePathFromObject(obj);
      if (img) return { kind: 'image', path: img };

      // TABLE: a profile carrying columns[].
      const profileTable = tableFromProfile(obj);
      if (profileTable) return profileTable;

      // A `stdout` body (shell-style) — treat the OUTPUT as text/diff/table.
      const stdout = str(obj['stdout']);
      const stderr = str(obj['stderr']);
      const body = stdout || stderr;
      if (body) return detectToolResultContent(body);
    }

    // JSON / STRUCTURED fallback: backend preview or generic key summary.
    return { kind: 'json', preview: structuredPreview(parsed), full: prettyJson(parsed, text) };
  }

  // 3) Plain-text bodies.
  // DIFF text.
  if (looksLikeUnifiedDiff(text)) return { kind: 'diff', diff: text };
  // IMAGE: a bare path that is an image.
  if (!/\s/.test(text) && isImagePath(text)) return { kind: 'image', path: text };
  // TABLE: delimited header + rows.
  const table = detectDelimitedTable(text);
  if (table) return table;
  // A standalone unparseable but count/JSON-ish blob still reads as text.
  if (/^[[{]/.test(text)) {
    // Looked structured but didn't parse (truncated): surface the head as JSON.
    return { kind: 'json', preview: clip(text.replace(/\s+/g, ' '), 200), full: text };
  }
  // MARKDOWN / prose — let the markdown renderer handle headings/lists/etc.
  if (looksLikeMarkdown(text)) return { kind: 'markdown', text };
  // PLAIN text.
  return { kind: 'text', text };
}

/** Heuristic: does this prose carry markdown structure worth rendering as md? */
function looksLikeMarkdown(text: string): boolean {
  return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)/.test(text) || /\*\*[^*]+\*\*/.test(text);
}

export { findBalancedJsonEnd };
