import { useState } from 'react';
import { Markdown } from '../markdown';
import { formatDurationSeconds } from '../../wire/formatters';
import { isRecord, normalizeWhitespace, stringValue, truncate } from '../../wire/presentationUtils';
import type { WirePart } from '../registry';
import {
  extractCsvBlock,
  extractImageBlock,
  extractStructuredContent,
  extractToolResultText,
  type ContentImageBlock,
} from './toolResultText';
import { sanitizeTitle } from './titleSanitizer';
import { formatDurationMs } from './HandoffPart';

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

/** One resolved sibling of a `wait_agent_tasks`/`check_agent_tasks` call
 *  (wire contract: `tool_call.metadata.waited_tasks`). `name` is the
 *  server-resolved display name — rendered verbatim, never composed from
 *  `agent_id`/`run_label` client-side. */
export interface WaitedTask {
  task_id: string;
  agent_id: string;
  run_index: number;
  run_label: string;
  child_session_id: string;
  name: string;
}

/**
 * Reads `metadata.waited_tasks` off a wait-family tool_call. `null` when the
 * field is absent (older sessions, or a call this build doesn't recognize as
 * resolved yet) OR when an entry doesn't carry the one field this renders
 * verbatim (`name`) — a partially-malformed list falls back to today's
 * behavior entirely rather than rendering a mix of resolved and raw ids.
 */
export function waitedTasksOf(call: WirePart): WaitedTask[] | null {
  const metadata = call['metadata'];
  if (!isRecord(metadata)) return null;
  const raw = metadata['waited_tasks'];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const tasks: WaitedTask[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) return null;
    const name = entry['name'];
    if (typeof name !== 'string' || name.length === 0) return null;
    tasks.push({
      task_id: str(entry['task_id']),
      agent_id: str(entry['agent_id']),
      run_index: typeof entry['run_index'] === 'number' ? entry['run_index'] : 0,
      run_label: str(entry['run_label']),
      child_session_id: str(entry['child_session_id']),
      name,
    });
  }
  return tasks;
}

/**
 * A collapsed, re-polled `wait_agent_tasks`/`check_agent_tasks` call carries
 * its retry facts as `attempts`/`budgets` on the tool_call part's
 * `metadata` (round-7 wire finding: attempts=2, budgets=[60.0,90.0] — never
 * surfaced in the expanded well). Only these two keys are read here —
 * `stream_source`/`telemetry_source` and anything else on `metadata` stay
 * internal, never dumped. `attempts` only counts once it's actually a retry
 * (>1); a single value doesn't earn a chip.
 */
function metadataFacts(call: WirePart): { attempts?: number; budgets?: number[] } {
  const metadata = call['metadata'];
  if (!isRecord(metadata)) return {};
  const attemptsRaw = metadata['attempts'];
  const attempts = typeof attemptsRaw === 'number' && attemptsRaw > 1 ? attemptsRaw : undefined;
  const budgetsRaw = metadata['budgets'];
  const budgets =
    Array.isArray(budgetsRaw) && budgetsRaw.length > 0 && budgetsRaw.every((b) => typeof b === 'number')
      ? (budgetsRaw as number[])
      : undefined;
  return { attempts, budgets };
}

/** Compact seconds formatting for the budgets chip: whole seconds render bare
 *  (`60s`), fractional seconds keep one decimal (`1.5s`) — never the raw
 *  float noise of `Number.prototype.toString()`. */
function formatSecondsCompact(seconds: number): string {
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
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

/**
 * A field literally named `duration_ms` prints as raw float noise straight
 * off the wire (`73215.67400000001`) through every plain stringifier above
 * — the collapsed row's own duration badge already reads a clean "1.4s"
 * (`formatDurationSeconds`, imported above), but a `duration_ms` KV/table
 * cell inside the OPENED well did not (round-8 owner finding, anomaly C).
 * Reuses HandoffPart's shared "1m 13.2s" / "73.2s" idiom rather than
 * growing a second formatter here. Matches on the exact key only — never a
 * heuristic guess at "this number looks like a duration."
 */
function formatDurationField(key: string, v: unknown): string | null {
  if (key !== 'duration_ms' || typeof v !== 'number' || !Number.isFinite(v)) return null;
  return formatDurationMs(v) || '0s';
}

/**
 * A `loser_runs` field — the not-the-winner siblings of a resolved
 * conflict — prints as the raw per-run JSON off the wire
 * (`{"run_index":2,...}`) through every plain stringifier above (round-10
 * gate finding D11). Each entry's own resolved `run_label`/`name` wins when
 * present (the same resolved-name contract {@link waitedTasksOf} already
 * reads); otherwise falls back to `agent #<run_index + 1>` off the one field
 * every entry carries. Matches on the exact key only, same discipline as
 * {@link formatDurationField} — never a heuristic guess. `null` when `v`
 * isn't shaped like a run-descriptor array, so the caller falls through to
 * the ordinary stringifier untouched.
 */
function formatLoserRuns(key: string, v: unknown): string | null {
  if (key !== 'loser_runs' || !Array.isArray(v) || v.length === 0) return null;
  if (!v.every((entry) => isRecord(entry))) return null;
  const names = v.map((entry) => {
    const label = entry['run_label'] ?? entry['name'];
    if (typeof label === 'string' && label.length > 0) return label;
    const index = entry['run_index'];
    return typeof index === 'number' && Number.isFinite(index) ? `agent #${index + 1}` : null;
  });
  return names.every((name): name is string => Boolean(name)) ? names.join(', ') : null;
}

/** {@link kvValue}, but for a KNOWN object key — routes `duration_ms`
 *  through {@link formatDurationField} and `loser_runs` through
 *  {@link formatLoserRuns} first. */
function kvValueForKey(key: string, v: unknown): string {
  return formatDurationField(key, v) ?? formatLoserRuns(key, v) ?? kvValue(v);
}

function kvRowsFromObject(obj: Record<string, unknown>): Array<{ k: string; v: string }> {
  return Object.entries(obj).map(([k, v]) => ({ k, v: kvValueForKey(k, v) }));
}

/**
 * The shared top-level-object JSON parse both `resultRows` and the wait-
 * shape detector use — a bounded, defensive parse (size-capped, object-only)
 * rather than each caller re-deriving its own guard.
 */
function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || trimmed.length > 20000) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * A JSON-object tool result rendered as the prototype's key/value result
 * table (isToolSeg's "results tables") instead of a raw JSON blob. Only a
 * top-level OBJECT becomes rows — arrays and scalars keep the verbatim
 * `<pre>`, and anything unparseable falls through untouched. Presentation
 * only: every key and value from the wire still renders, nothing is dropped.
 */
function resultRows(text: string): Array<{ k: string; v: string }> | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
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

/** {@link cellValue}, but for a KNOWN column name — routes a `duration_ms`
 *  column through {@link formatDurationField} and a `loser_runs` column
 *  through {@link formatLoserRuns} first (see kvValueForKey). */
function cellValueForKey(key: string, v: unknown): string {
  return formatDurationField(key, v) ?? formatLoserRuns(key, v) ?? cellValue(v);
}

/**
 * A raw wire key rendered as a table HEADER (round-10 gate finding D11):
 * `duration_ms` is fine as a column NAME in the data, but once the CELLS in
 * that column are reformatted away from raw milliseconds
 * ({@link formatDurationField}) the header should say what the reader is
 * actually looking at. Strips the `_ms` suffix on that one literal key only
 * — never a blanket underscore/casing rewrite of every header, which would
 * silently touch wire vocabulary this ladder has deliberately left alone
 * everywhere else.
 */
function humanizeHeader(key: string): string {
  return key === 'duration_ms' ? 'duration' : key;
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
  const keys = Object.keys(items[0] ?? {});
  const header = keys.map(humanizeHeader);
  const rows = items.map((item) => keys.map((key) => cellValueForKey(key, item[key])));
  return { header, rows };
}

/** A splitStructuredObject bucket: a nested plain-object VALUE (not an
 *  array), pulled out to render as its own collapsible section instead of a
 *  pretty-printed JSON blob sitting inline in the KV grid. */
export interface StructuredSection {
  key: string;
  value: Record<string, unknown>;
}

/**
 * Round-6 live finding: a WRAPPER object (`{ points: [72 station objects],
 * count: 72, ok: true }`) was collapsing its 72-row array into a single
 * opaque KV value — the exact case the table rung exists for, just one
 * level down from the root. This walks the object's OWN values (never
 * recursing further into arrays) and splits them three ways: a
 * uniform-object-array value with MORE THAN ONE row is pulled out as its own
 * table (labeled by its key); a non-empty nested PLAIN OBJECT value (e.g. a
 * `merged_workflow_state` dict) is pulled out as its own collapsible
 * {@link StructuredSection} instead of overflowing the KV grid as one giant
 * pretty-printed string; everything else — scalars, single-row arrays,
 * non-uniform arrays, empty objects — stays a KV value via the existing
 * {@link kvValue} stringification, verbatim. No key is ever dropped from any
 * bucket.
 */
function splitStructuredObject(obj: Record<string, unknown>): {
  rows: Array<{ k: string; v: string }>;
  tables: Array<{ key: string; header: string[]; rows: string[][] }>;
  sections: StructuredSection[];
} {
  const rows: Array<{ k: string; v: string }> = [];
  const tables: Array<{ key: string; header: string[]; rows: string[][] }> = [];
  const sections: StructuredSection[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (isUniformObjectArray(v) && v.length > 1) {
      const { header, rows: tableRows } = objectArrayToTable(v);
      tables.push({ key: k, header, rows: tableRows });
      continue;
    }
    if (isRecord(v) && Object.keys(v).length > 0) {
      sections.push({ key: k, value: v });
      continue;
    }
    rows.push({ k, v: kvValueForKey(k, v) });
  }
  return { rows, tables, sections };
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
      sections: StructuredSection[];
    }
  | {
      kind: 'wait';
      /** The wire's own `summary` string ("waited 1.2s for 3 tasks — 3
       *  completed"), when present — rendered as its OWN first line, ahead
       *  of the results table (round-8 owner finding: it used to fall into
       *  the generic `otherRows` KV grid, which rendered AFTER the
       *  conflicts block instead of leading the well as the declared shape
       *  says: summary, results, conflicts, merged). */
      summary: string | undefined;
      resultsTable: { header: string[]; rows: string[][] } | null;
      resultsRows: Array<{ k: string; v: string }>;
      conflicts: unknown[] | undefined;
      mergedState: Record<string, unknown> | null;
      otherRows: Array<{ k: string; v: string }>;
    }
  | { kind: 'image'; block: ContentImageBlock }
  | { kind: 'raw' };

/**
 * `wait_agent_tasks`/`check_agent_tasks`' own result shape (owner, round-7
 * live fan-out session: the expanded well showed a raw
 * `{"merged_workflow_state": {...}` dump): a `results` array alongside
 * `merged_workflow_state` and/or `workflow_state_conflicts`.
 *
 * This is a VALIDITY check on an already-gated structured payload, never a
 * discovery mechanism on its own (adversarial review, P4R finding A): the
 * caller must first confirm the call's own tool name is wait-family AND a
 * real `structured_content` is present — see the gate in
 * {@link interpretResult}. Duck-typing this shape off the model-facing TEXT
 * lane silently swept every historical wait result (written before
 * `structured_content` existed) into this ladder; that fallback is gone.
 */
function isWaitResultShape(obj: Record<string, unknown>): boolean {
  return (
    Array.isArray(obj['results']) &&
    ('merged_workflow_state' in obj || 'workflow_state_conflicts' in obj)
  );
}

/**
 * Splits the wait-result object into the ladder's dedicated rungs (owner
 * design): `results` -> the table rung when uniform, else a KV fallback
 * (never dropped either way); `workflow_state_conflicts`, WHEN PRESENT, ->
 * its own typed line + rows (never silently swallowed into the generic KV
 * grid); `merged_workflow_state` -> a collapsed {@link NestedSection}
 * instead of a raw dump; everything else on the object still renders as
 * plain KV rows. Presentation order here is the display contract itself
 * (results, conflicts, merged state) regardless of the wire's own key
 * order.
 */
function buildWaitInterpretation(obj: Record<string, unknown>): Extract<InterpretedResult, { kind: 'wait' }> {
  const { results, workflow_state_conflicts, merged_workflow_state, summary, ...rest } = obj;
  const resultsArray = Array.isArray(results) ? results : [];
  const resultsTable = isUniformObjectArray(resultsArray) ? objectArrayToTable(resultsArray) : null;
  const resultsRows =
    !resultsTable && resultsArray.length > 0
      ? resultsArray.map((item, i) => ({ k: String(i), v: kvValue(item) }))
      : [];
  const conflicts = Array.isArray(workflow_state_conflicts) ? workflow_state_conflicts : undefined;
  const mergedState = isRecord(merged_workflow_state) ? merged_workflow_state : null;
  // Pulled out of `rest` (never double-rendered in otherRows below) — its
  // own dedicated typed line, not a generic KV row.
  const summaryText = typeof summary === 'string' && summary.trim().length > 0 ? summary : undefined;
  const otherRows = kvRowsFromObject(rest);
  return { kind: 'wait', summary: summaryText, resultsTable, resultsRows, conflicts, mergedState, otherRows };
}

/**
 * The result render ladder (owner design 2026-08-05), replacing "print the
 * JSON string and hope": the wait-family result shape first — gated on BOTH
 * the call's own `tool_name` (`wait_agent_tasks`/`check_agent_tasks`) AND a
 * real `structured_content` payload, never duck-typed off the model-facing
 * text (adversarial review, P4R finding A: a text-shape guess silently
 * swept every HISTORICAL wait result — written before `structured_content`
 * existed — into this ladder; those old sessions must keep rendering exactly
 * as they did before this ladder existed, off the same rungs below /
 * generic KV/table/raw handling everything else gets) — its own dedicated
 * rungs, see {@link buildWaitInterpretation}, then
 * `structured_content` (a root array of uniform objects -> a real table; a
 * root OBJECT -> the KV grid, or — round-6 fix — KV grid + a labeled table
 * per qualifying array-valued key + a collapsed section per qualifying
 * nested-object-valued key, see {@link splitStructuredObject}), then content
 * blocks by mime type (image, text/csv -> table), then the existing
 * text/JSON-object handling, and finally the verbatim fallback that was
 * already here. Every step only fires on a shape it can actually interpret
 * — anything else falls through to the next rung, and the bottom rung is
 * the untouched raw `<pre>`.
 */
function interpretResult(result: WirePart, text: string, toolName: string): InterpretedResult {
  const structured = extractStructuredContent(result);
  if (WAIT_AGENT_TOOL_NAMES.has(toolName) && isRecord(structured) && isWaitResultShape(structured)) {
    return buildWaitInterpretation(structured);
  }

  if (isUniformObjectArray(structured)) {
    const { header, rows } = objectArrayToTable(structured);
    return { kind: 'table', header, rows };
  }
  if (isRecord(structured)) {
    const { rows, tables, sections } = splitStructuredObject(structured);
    if (tables.length > 0 || sections.length > 0) return { kind: 'object', rows, tables, sections };
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

/**
 * The collapsed row's PREVIEW LINE (round-10 gate finding D3): prefers a
 * short summary derived from `structured_content` — reusing the SAME shape
 * predicates the opened well's ladder uses ({@link isUniformObjectArray},
 * {@link isRecord}, {@link isWaitResultShape}) — over the raw MCP envelope
 * text. Before this, a collapsed `ndp_search_datasets` row showed
 * `{"content": [{"text": "{\"datasets\"...` (the raw wire shape) instead of
 * anything a reader could actually use.
 *
 * A uniform table's first row's first column reads as its natural label
 * ("earthscope_stations (1 row)"); a wait result's own designed `summary`
 * sentence wins outright when present; otherwise the first genuinely SCALAR
 * top-level field (skipping array/object values, which are never a one-line
 * summary) — never a keyword/field-name guess, purely structural, matching
 * this file's existing discipline. `''` when there is no structured content
 * to summarize (or nothing in it is scalar), so the caller falls back to the
 * raw text — never invented, never blank-when-something-real-exists.
 */
function structuredPreview(result: WirePart): string {
  const structured = extractStructuredContent(result);
  if (isUniformObjectArray(structured)) {
    const { rows } = objectArrayToTable(structured);
    const label = rows[0]?.[0];
    const count = `${rows.length} row${rows.length === 1 ? '' : 's'}`;
    return label ? `${label} (${count})` : count;
  }
  if (isRecord(structured)) {
    if (isWaitResultShape(structured)) {
      const summary = structured['summary'];
      if (typeof summary === 'string' && summary.trim().length > 0) return summary.trim();
    }
    for (const [k, v] of Object.entries(structured)) {
      if (v === null || v === undefined || Array.isArray(v) || isRecord(v)) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        return `${k}: ${stringValue(v)}`;
      }
    }
  }
  return '';
}

/**
 * The metadata chips (attempts/budgets) — spaced, not middot-joined (owner's
 * ruling), pinned at the top of the well ahead of params. Absent facts
 * render nothing, individually: an attempts-only call shows one chip, a
 * budgets-only call shows the other, never an empty container.
 */
function MetadataChips({ attempts, budgets }: { attempts?: number; budgets?: number[] }) {
  if (attempts === undefined && budgets === undefined) return null;
  return (
    <div className="part-toolrow__metachips" data-testid="part-tool-metachips">
      {attempts !== undefined ? (
        <span className="part-toolrow__metachip" data-testid="part-tool-metachip-attempts">
          {`attempts ${attempts}`}
        </span>
      ) : null}
      {budgets !== undefined ? (
        <span className="part-toolrow__metachip" data-testid="part-tool-metachip-budgets">
          {`budgets ${budgets.map(formatSecondsCompact).join(' ')}`}
        </span>
      ) : null}
    </div>
  );
}

/**
 * `variant="result"` (round-10 gate finding D10) adds the prototype's own
 * shaded card around a RESULT grid (P-12: center/bbox/provenance sit in a
 * rounded `var(--t-well)` box) — params stay plain so a reader can tell
 * "what was sent" from "what came back" without reading every row.
 */
function KvRows({
  rows,
  testId,
  variant,
}: {
  rows: Array<{ k: string; v: string }>;
  testId?: string;
  variant?: 'result';
}) {
  const className =
    variant === 'result' ? 'part-toolrow__grid part-toolrow__grid--result' : 'part-toolrow__grid';
  return (
    <div className={className} data-testid={testId}>
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
 * A nested plain-object value (a {@link StructuredSection}, e.g.
 * `merged_workflow_state`) rendered as its own collapsed section instead of
 * overflowing the KV grid as one giant pretty-printed string — collapsed by
 * default, one click reveals its own KV rows/tables/sections via the SAME
 * {@link splitStructuredObject} split, recursively, so an arbitrarily deep
 * nested dict never falls back to raw JSON until the reader actually asks
 * for it (the existing raw toggle, still one keypress away at the top).
 */
function NestedSection({ label, value }: { label: string; value: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const { rows, tables, sections } = splitStructuredObject(value);
  return (
    <div className="part-toolrow__section" data-testid="part-tool-result-section">
      <button
        type="button"
        className="part-toolrow__sectiontoggle"
        aria-expanded={open}
        data-testid="part-tool-result-section-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="part-toolrow__chev" data-open={open ? 'true' : undefined} aria-hidden="true">
          ▸
        </span>
        {label}
      </button>
      {open ? (
        <div className="part-toolrow__sectionbody">
          {rows.length > 0 ? <KvRows rows={rows} variant="result" /> : null}
          {tables.map((t) => (
            <div className="part-toolrow__subtable" key={t.key}>
              <p className="part-toolrow__subtablelabel" data-testid="part-tool-result-subtable-label">
                {`${t.key} (${t.rows.length})`}
              </p>
              <ResultTable header={t.header} rows={t.rows} />
            </div>
          ))}
          {sections.map((s) => (
            <NestedSection key={s.key} label={s.key} value={s.value} />
          ))}
        </div>
      ) : null}
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

  const params = argRows(call['input']);
  const { attempts, budgets } = metadataFacts(call);
  const isError = result ? result['is_error'] === true : false;
  const durationMs = typeof result?.['duration_ms'] === 'number' ? (result['duration_ms'] as number) : undefined;
  const meta = durationMs !== undefined ? `${formatDurationSeconds(durationMs)}s` : '';
  const mark = result ? (isError ? '✗' : '✓') : '';
  const text = result ? extractToolResultText(result) : '';

  // A settled wait_agent_tasks/check_agent_tasks call: `wait(<name>, <name>,
  // <name>)` — the server-resolved names verbatim (owner, round-7 live
  // fan-out session: the row was rendering
  // `wait_agent_tasks(["task_cc806f98b07c", ...])`, raw ids). Absent field
  // (older sessions) falls through to today's name(argHint) row unchanged.
  const waited = waitedTasksOf(call);
  // The collapsed one-line preview prefers a structured_content-derived
  // summary (round-10 gate finding D3) over the raw MCP envelope text — a
  // collapsed `ndp_search_datasets` row used to show `{"content": [{"text":
  // "{\"datasets\"...` (the raw wire shape) instead of anything a reader
  // could use. Never for a FAILED result (the raw text/error IS the useful
  // preview there — unchanged) or a resolved wait row: for a resolved wait
  // row that text is `{"results": [{"agent_id": ..., "task_id": "task_...",
  // ...`, the exact raw-id leak the header above already resolved to names
  // (round-8 owner finding, anomaly A: the header read `wait (geospatial #1,
  // geospatial #2, geospatia...)` while the preview line right below it
  // still leaked the raw JSON). The resolved names are already on screen in
  // the header/argHint, so the preview is elided entirely here rather than
  // repeating them a second time.
  const structuredSummary = result && !isError && !waited ? structuredPreview(result) : '';
  const previewSource = structuredSummary || text;
  const previewLine =
    !open && previewSource && !waited ? truncate(normalizeWhitespace(previewSource), PREVIEW_MAX) : '';

  const thought = str(call['thought']);

  // A) Tool titles (owner design 2026-08-05): `tool_title`/`server_title` are
  // OPTIONAL wire fields on the tool_call. Presence is judged on the RAW
  // field (a string, even an empty one, counts as "the wire sent this"), so
  // absence renders EXACTLY today's raw-name-only row (regression pin) while
  // presence always keeps the raw identifier on screen — it's what went to
  // the model, and it must be visible when a call fails. A resolved wait row
  // has already replaced the whole name(args) segment, so a tool_title never
  // applies alongside it.
  const rawTitle = call['tool_title'];
  const hasTitle = !waited && typeof rawTitle === 'string';
  const displayName = waited ? 'wait' : hasTitle ? sanitizeTitle(rawTitle, name) : name;
  const argHint = waited
    ? truncate(normalizeWhitespace(waited.map((t) => t.name).join(', ')), ARG_HINT_MAX)
    : firstArgHint(call['input']);
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
          <MetadataChips attempts={attempts} budgets={budgets} />
          {/* A resolved wait row's own params are raw task_ids — the same
              raw-id leak the header just fixed. waited_tasks already carries
              richer, resolved identity for each task (surfaced via the
              header and, once it lands, the results table below), so the
              params well contributes nothing here and is skipped rather
              than showing the ids a second time. */}
          {!waited && params.length > 0 ? <KvRows rows={params} /> : null}
          {result ? (
            (() => {
              const interpreted = interpretResult(result, text, name);
              switch (interpreted.kind) {
                case 'kv':
                  return (
                    <>
                      <KvRows rows={interpreted.rows} testId="part-tool-result-table" variant="result" />
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
                        <KvRows rows={interpreted.rows} testId="part-tool-result-table" variant="result" />
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
                      {interpreted.sections.map((s) => (
                        <NestedSection key={s.key} label={s.key} value={s.value} />
                      ))}
                      <RawToggle text={text} />
                    </>
                  );
                case 'wait': {
                  const { summary, resultsTable, resultsRows, conflicts, mergedState, otherRows } =
                    interpreted;
                  return (
                    <>
                      {/* Declared shape: summary, results, conflicts, merged
                          — leads the well, right after the metachips above
                          (round-8 owner finding: this used to render AFTER
                          the conflicts block, folded anonymously into the
                          generic otherRows KV grid). */}
                      {summary ? (
                        <p className="part-toolrow__summary" data-testid="part-tool-wait-summary">
                          {summary}
                        </p>
                      ) : null}
                      {resultsTable ? (
                        <div className="part-toolrow__subtable">
                          <p
                            className="part-toolrow__subtablelabel"
                            data-testid="part-tool-result-subtable-label"
                          >
                            {`results (${resultsTable.rows.length})`}
                          </p>
                          <ResultTable header={resultsTable.header} rows={resultsTable.rows} />
                        </div>
                      ) : resultsRows.length > 0 ? (
                        <KvRows rows={resultsRows} testId="part-tool-wait-results" variant="result" />
                      ) : null}
                      {/* workflow_state_conflicts, WHEN PRESENT, as its own
                          typed line — never blended into a generic KV row a
                          reader could skim past. */}
                      {conflicts !== undefined ? (
                        <p
                          className="part-toolrow__conflicts"
                          data-testid="part-tool-wait-conflicts"
                          data-empty={conflicts.length === 0 ? 'true' : undefined}
                        >
                          {conflicts.length > 0
                            ? `⚠ ${conflicts.length} workflow state conflict${conflicts.length === 1 ? '' : 's'}`
                            : 'no workflow state conflicts'}
                        </p>
                      ) : null}
                      {conflicts && conflicts.length > 0 ? (
                        isUniformObjectArray(conflicts) ? (
                          <ResultTable {...objectArrayToTable(conflicts)} />
                        ) : (
                          <KvRows
                            rows={conflicts.map((c, i) => ({ k: String(i), v: kvValue(c) }))}
                            testId="part-tool-wait-conflicts-rows"
                            variant="result"
                          />
                        )
                      ) : null}
                      {otherRows.length > 0 ? <KvRows rows={otherRows} variant="result" /> : null}
                      {mergedState ? <NestedSection label="merged_workflow_state" value={mergedState} /> : null}
                      <RawToggle text={text} />
                    </>
                  );
                }
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
