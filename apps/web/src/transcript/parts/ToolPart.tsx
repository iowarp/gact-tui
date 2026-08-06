import { useState } from 'react';
import { Markdown } from '../markdown';
import { formatDurationSeconds } from '../../wire/formatters';
import { isRecord, normalizeWhitespace, truncate } from '../../wire/presentationUtils';
import type { WirePart } from '../registry';
import {
  extractCsvBlock,
  extractImageBlock,
  extractStructuredContent,
  extractToolResultText,
  type ContentImageBlock,
} from './toolResultText';
import { sanitizeTitle } from './titleSanitizer';

export interface ToolPartProps {
  call: WirePart;
  /** Absent while the call is still in flight — no result has arrived yet. */
  result?: WirePart;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

const ARG_HINT_MAX = 42;
const PREVIEW_MAX = 96;

/** The curated durable-job polling tools (JARVIS/Spack surface, P2.14) whose
 *  RUNNING call renders as the prototype's activity line rather than a
 *  collapsed tool row — the call itself IS "waiting on N background agents",
 *  not a discrete action worth a name/args/chevron row. */
const WAIT_AGENT_TOOL_NAMES = new Set(['wait_agent_tasks', 'check_agent_tasks']);

/**
 * `wait_agent_tasks`/`check_agent_tasks` calls carry the polled `task_ids`
 * array in their input; this reads its length. Returns null when the call is
 * neither of those two tools, or carries no such array — never a guessed
 * count.
 */
export function waitingTaskCount(call: WirePart): number | null {
  const name = str(call['tool_name'] ?? call['name']);
  if (!WAIT_AGENT_TOOL_NAMES.has(name)) return null;
  const input = call['input'];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const taskIds = (input as Record<string, unknown>)['task_ids'];
  return Array.isArray(taskIds) ? taskIds.length : null;
}

function firstArgHint(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '…';
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return '…';
  const [, value] = entries[0]!;
  // A string value keeps its quotes (final-sxs ledger #12: the prototype
  // shows `geo_geocode("Los Angeles, CA")`, not the bare, ambiguous-looking
  // `geo_geocode(Los Angeles, CA)`) — every other JSON type already reads
  // unambiguously via JSON.stringify.
  const rendered = typeof value === 'string' ? `"${value}"` : (JSON.stringify(value) ?? String(value));
  return truncate(normalizeWhitespace(rendered), ARG_HINT_MAX);
}

function argRows(input: unknown): Array<{ k: string; v: string }> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
  return Object.entries(input as Record<string, unknown>).map(([k, v]) => ({
    k,
    v: typeof v === 'string' ? v : (JSON.stringify(v) ?? String(v)),
  }));
}

/** Shared KV-value stringification (pretty-printed — these are read as a
 *  short block of prose in the result well, not packed into a table cell). */
function kvValue(v: unknown): string {
  return typeof v === 'string' ? v : (JSON.stringify(v, null, 1) ?? String(v));
}

function kvRowsFromObject(obj: Record<string, unknown>): Array<{ k: string; v: string }> {
  return Object.entries(obj).map(([k, v]) => ({ k, v: kvValue(v) }));
}

/**
 * A JSON-object tool result rendered as the prototype's key/value result
 * table (isToolSeg's "results tables") instead of a raw JSON blob. Only a
 * top-level OBJECT becomes rows — arrays and scalars keep the verbatim
 * `<pre>`, and anything unparseable falls through untouched. Presentation
 * only: every key and value from the wire still renders, nothing is dropped.
 */
function resultRows(text: string): Array<{ k: string; v: string }> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || trimmed.length > 20000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const rows = kvRowsFromObject(parsed);
  return rows.length > 0 ? rows : null;
}

/** Compact single-line cell stringification for the real-table renderer
 *  (step B2/B3 of the result ladder) — unlike {@link kvValue} this never
 *  pretty-prints, so a nested value doesn't blow out a table row's height. */
function cellValue(v: unknown): string {
  if (v === undefined) return '';
  return typeof v === 'string' ? v : (JSON.stringify(v) ?? String(v));
}

/**
 * `structured_content` (or a text/csv content block) only earns the real
 * table renderer when every array element is a plain object carrying the
 * SAME set of keys — that's what "uniform" means: a well-formed row set
 * with real columns, not a coincidence of a mixed-shape array.
 */
function isUniformObjectArray(value: unknown): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0) return false;
  if (!value.every((item) => isRecord(item))) return false;
  const items = value as Array<Record<string, unknown>>;
  const firstKeys = JSON.stringify(Object.keys(items[0]!).sort());
  return items.every((item) => JSON.stringify(Object.keys(item).sort()) === firstKeys);
}

function objectArrayToTable(items: Array<Record<string, unknown>>): { header: string[]; rows: string[][] } {
  const header = Object.keys(items[0] ?? {});
  const rows = items.map((item) => header.map((key) => cellValue(item[key])));
  return { header, rows };
}

/**
 * Round-6 live finding: a WRAPPER object (`{ points: [72 station objects],
 * count: 72, ok: true }`) was collapsing its 72-row array into a single
 * opaque KV value — the exact case the table rung exists for, just one
 * level down from the root. This walks the object's OWN values (never
 * recursing further) and splits them: a uniform-object-array value with
 * MORE THAN ONE row is pulled out as its own table (labeled by its key);
 * everything else — scalars, single-row arrays, non-uniform arrays, nested
 * objects — stays a KV value via the existing {@link kvValue}
 * stringification, verbatim. No key is ever dropped from either bucket.
 */
function splitStructuredObject(obj: Record<string, unknown>): {
  rows: Array<{ k: string; v: string }>;
  tables: Array<{ key: string; header: string[]; rows: string[][] }>;
} {
  const rows: Array<{ k: string; v: string }> = [];
  const tables: Array<{ key: string; header: string[]; rows: string[][] }> = [];
  for (const [k, v] of Object.entries(obj)) {
    if (isUniformObjectArray(v) && v.length > 1) {
      const { header, rows: tableRows } = objectArrayToTable(v);
      tables.push({ key: k, header, rows: tableRows });
      continue;
    }
    rows.push({ k, v: kvValue(v) });
  }
  return { rows, tables };
}

/** Naive comma-split CSV, matching the existing DetailSlot Preview idiom
 *  (`src/detail/preview.ts`) — no quoted-comma handling, same tradeoff the
 *  rest of this codebase already accepts for CSV previews. */
function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const header = (lines[0] ?? '').split(',');
  const rows = lines.slice(1).map((line) => line.split(','));
  return { header, rows };
}

type InterpretedResult =
  | { kind: 'kv'; rows: Array<{ k: string; v: string }> }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | {
      kind: 'object';
      rows: Array<{ k: string; v: string }>;
      tables: Array<{ key: string; header: string[]; rows: string[][] }>;
    }
  | { kind: 'image'; block: ContentImageBlock }
  | { kind: 'raw' };

/**
 * The result render ladder (owner design 2026-08-05), replacing "print the
 * JSON string and hope": `structured_content` first (a root array of
 * uniform objects -> a real table; a root OBJECT -> the KV grid, or —
 * round-6 fix — KV grid + a labeled table per qualifying array-valued key
 * when one is present, see {@link splitStructuredObject}), then content
 * blocks by mime type (image, text/csv -> table), then the existing
 * text/JSON-object handling, and finally the verbatim fallback that was
 * already here. Every step only fires on a shape it can actually interpret
 * — anything else falls through to the next rung, and the bottom rung is
 * the untouched raw `<pre>`.
 */
function interpretResult(result: WirePart, text: string): InterpretedResult {
  const structured = extractStructuredContent(result);
  if (isUniformObjectArray(structured)) {
    const { header, rows } = objectArrayToTable(structured);
    return { kind: 'table', header, rows };
  }
  if (isRecord(structured)) {
    const { rows, tables } = splitStructuredObject(structured);
    if (tables.length > 0) return { kind: 'object', rows, tables };
    if (rows.length > 0) return { kind: 'kv', rows };
  }

  const image = extractImageBlock(result);
  if (image) return { kind: 'image', block: image };

  const csv = extractCsvBlock(result);
  if (csv) {
    const { header, rows } = parseCsv(csv);
    if (header.length > 0 && rows.length > 0) return { kind: 'table', header, rows };
  }

  const rows = resultRows(text);
  if (rows) return { kind: 'kv', rows };

  return { kind: 'raw' };
}

function KvRows({ rows, testId }: { rows: Array<{ k: string; v: string }>; testId?: string }) {
  return (
    <div className="part-toolrow__grid" data-testid={testId}>
      {rows.map((row) => (
        <div className="part-toolrow__row" key={row.k}>
          <span className="part-toolrow__k">{row.k}</span>
          <span className="part-toolrow__v">{row.v}</span>
        </div>
      ))}
    </div>
  );
}

const TABLE_INITIAL_ROWS = 20;

/** The real table half of the result ladder (structured array / CSV block)
 *  — first {@link TABLE_INITIAL_ROWS} rows + a "show more" reveal, the
 *  local sibling to DetailSlot's Preview CSV table (not importable — that
 *  component is private to DetailSlot.tsx). */
function ResultTable({ header, rows }: { header: string[]; rows: string[][] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, TABLE_INITIAL_ROWS);
  const hasMore = rows.length > TABLE_INITIAL_ROWS;
  return (
    <div className="part-toolrow__tablewrap" data-testid="part-tool-result-grid">
      <table className="part-toolrow__table">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore ? (
        <p className="part-toolrow__tablefoot">
          {expanded ? `all ${rows.length} rows` : `first ${TABLE_INITIAL_ROWS} of ${rows.length} rows`}
          {!expanded ? (
            <button type="button" className="part-toolrow__tablemore" onClick={() => setExpanded(true)}>
              show more
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** Inline bounded image (result ladder step B2) — `data` (base64) becomes a
 *  data: URI, `url` renders directly; the block is only ever constructed by
 *  {@link extractImageBlock} once one of the two is confirmed present. */
function ResultImage({ block }: { block: ContentImageBlock }) {
  const src = block.url || (block.data ? `data:${block.mimeType};base64,${block.data}` : '');
  if (!src) return null;
  return (
    <div className="part-toolrow__imagewrap" data-testid="part-tool-result-image">
      <img className="part-toolrow__image" src={src} alt="tool result" />
    </div>
  );
}

/**
 * Result ladder step B3: whenever a renderer INTERPRETED the payload
 * (table/image/KV), the verbatim original text stays one keypress away —
 * never removed, never re-serialized from the parsed shape. Collapsed by
 * default so the interpreted view stays the primary read.
 */
function RawToggle({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="part-toolrow__raw">
      <button
        type="button"
        className="part-toolrow__rawtoggle"
        aria-expanded={open}
        data-testid="part-tool-raw-toggle"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'hide raw' : 'raw'}
      </button>
      {open ? (
        <pre className="part-toolrow__rawpre" data-testid="part-tool-raw">
          {text || '(empty result)'}
        </pre>
      ) : null}
    </div>
  );
}

/**
 * The prototype's isToolSeg row (design/prototype/Clio Session.html:391) — ONE
 * collapsible line per call, not two permanently-open cards. Closed by
 * default: the header carries the name(argHint), duration, and ✓/✗ mark; a
 * chevron opens a bordered well with the full params and the FULL result
 * text. A one-line preview still shows while closed so the row isn't empty,
 * but nothing is ever cut mid-token the way the old always-open card did —
 * the full text is always one click away, never silently truncated.
 */
export function ToolPart({ call, result }: ToolPartProps) {
  const [open, setOpen] = useState(false);
  const name = str(call['tool_name'] ?? call['name']);

  // A RUNNING wait_agent_tasks/check_agent_tasks call (no result yet) is the
  // prototype's activity line, not a plain collapsed row — once the result
  // lands this falls straight through to the normal row below.
  const waitingCount = !result ? waitingTaskCount(call) : null;
  if (waitingCount !== null) {
    const noun = waitingCount === 1 ? 'agent' : 'agents';
    return (
      <p className="transcript__activity" data-testid="tool-wait-activity">
        <span className="transcript__activity-mark" aria-hidden="true">
          ✻
        </span>
        {` waiting for ${waitingCount} background ${noun}…`}
      </p>
    );
  }

  const argHint = firstArgHint(call['input']);
  const params = argRows(call['input']);
  const isError = result ? result['is_error'] === true : false;
  const durationMs = typeof result?.['duration_ms'] === 'number' ? (result['duration_ms'] as number) : undefined;
  const meta = durationMs !== undefined ? `${formatDurationSeconds(durationMs)}s` : '';
  const mark = result ? (isError ? '✗' : '✓') : '';
  const text = result ? extractToolResultText(result) : '';
  const previewLine = !open && text ? truncate(normalizeWhitespace(text), PREVIEW_MAX) : '';

  const thought = str(call['thought']);

  // A) Tool titles (owner design 2026-08-05): `tool_title`/`server_title` are
  // OPTIONAL wire fields on the tool_call. Presence is judged on the RAW
  // field (a string, even an empty one, counts as "the wire sent this"), so
  // absence renders EXACTLY today's raw-name-only row (regression pin) while
  // presence always keeps the raw identifier on screen — it's what went to
  // the model, and it must be visible when a call fails.
  const rawTitle = call['tool_title'];
  const hasTitle = typeof rawTitle === 'string';
  const displayName = hasTitle ? sanitizeTitle(rawTitle, name) : name;
  // server_title has no display surface yet beyond a `title` attribute
  // (grouping/breadcrumb is a later surface) — never a fabricated group
  // header.
  const serverTitle = sanitizeTitle(call['server_title'], '');

  return (
    <div className="part-toolrow" data-error={isError ? 'true' : undefined} data-testid="part-tool">
      {thought ? (
        <div className="part-toolrow__thought" data-testid="part-tool-thought">
          <Markdown text={thought} />
        </div>
      ) : null}
      <button
        type="button"
        className="part-toolrow__head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="part-toolrow__namewrap" title={serverTitle || undefined}>
          <span className="part-toolrow__name">{displayName}</span>
          {hasTitle ? (
            <span className="part-toolrow__rawname" data-testid="part-tool-rawname">
              {name}
            </span>
          ) : null}
          <span className="part-toolrow__hint">({argHint})</span>
        </span>
        <span className="part-toolrow__spacer" />
        {!result ? <span className="part-toolrow__pending">running…</span> : null}
        {meta ? <span className="part-toolrow__meta" data-error={isError ? 'true' : undefined}>{meta}</span> : null}
        {mark ? (
          <span className="part-toolrow__mark" data-error={isError ? 'true' : undefined}>
            {mark}
          </span>
        ) : null}
        <span className="part-toolrow__chev" data-open={open ? 'true' : undefined} aria-hidden="true">
          ▸
        </span>
      </button>
      {previewLine ? <p className="part-toolrow__preview">{previewLine}</p> : null}
      {open ? (
        <div className="part-toolrow__well" data-error={isError ? 'true' : undefined}>
          {params.length > 0 ? <KvRows rows={params} /> : null}
          {result ? (
            (() => {
              const interpreted = interpretResult(result, text);
              switch (interpreted.kind) {
                case 'kv':
                  return (
                    <>
                      <KvRows rows={interpreted.rows} testId="part-tool-result-table" />
                      <RawToggle text={text} />
                    </>
                  );
                case 'table':
                  return (
                    <>
                      <ResultTable header={interpreted.header} rows={interpreted.rows} />
                      <RawToggle text={text} />
                    </>
                  );
                case 'object':
                  return (
                    <>
                      {interpreted.rows.length > 0 ? (
                        <KvRows rows={interpreted.rows} testId="part-tool-result-table" />
                      ) : null}
                      {interpreted.tables.map((t) => (
                        <div className="part-toolrow__subtable" key={t.key}>
                          <p
                            className="part-toolrow__subtablelabel"
                            data-testid="part-tool-result-subtable-label"
                          >
                            {`${t.key} (${t.rows.length})`}
                          </p>
                          <ResultTable header={t.header} rows={t.rows} />
                        </div>
                      ))}
                      <RawToggle text={text} />
                    </>
                  );
                case 'image':
                  return (
                    <>
                      <ResultImage block={interpreted.block} />
                      <RawToggle text={text} />
                    </>
                  );
                case 'raw':
                default:
                  return <pre className="part-toolrow__result">{text || '(empty result)'}</pre>;
              }
            })()
          ) : (
            <p className="part-toolrow__waiting">waiting for the tool to return…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
