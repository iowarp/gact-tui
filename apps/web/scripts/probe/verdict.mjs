/**
 * PURE verdict reducer for gact-tui#364 (in-flight tool rendering) / #362
 * (thinking dropout) — joins four independently-captured streams of one
 * live-probe run into a per-`tool_call`-part-id verdict.
 *
 * This module performs NO file I/O and NO wall-clock reads in its exported
 * functions — every function is a deterministic transform over plain data,
 * so it is unit-testable from synthetic fixtures with no live stack (see
 * `apps/web/tests/unit/live-probe-verdict.test.ts`). A thin CLI wrapper at
 * the bottom (`main()`, guarded) does the file I/O and calls the pure API;
 * that is the only impure part of this file.
 *
 * ## The four input streams (one JSONL file each, one line per record)
 *
 * `live-probe.mjs` (the driver) writes these into a run directory. Each
 * stream's record shape is a CONTRACT between the driver and this reducer —
 * documented here so a future driver change that breaks the contract is
 * caught by the reducer's own fixtures, not by a live run failing silently.
 *
 * **server-sse.jsonl** — one record per raw SSE frame the driver parsed out
 * of the server's `CLIO_SSE_WIRE_TAP` (+ cross-referenced against
 * `CLIO_SSE_EVENT_LOG` for `sse_written_at`), BEFORE de-duplication. Because
 * `SessionView` opens TWO `EventSource` connections against the same
 * session's `/events` endpoint (one for `subscribeSessionMessageEvents`, one
 * for `subscribeSessionTraceEvents`) and the wire tap is per-connection,
 * every server-originated event appears here TWICE (same `event_id`,
 * different `sse_written_at`) — {@link dedupeServerFrames} collapses that
 * before use.
 * ```
 * {
 *   event_id: string,          // the SSE `id:` field (Last-Event-ID cursor)
 *   event_type: string,        // the SSE `event:` field / data.type
 *   occurred_at: string,       // ISO — the DOMAIN event's own timestamp
 *   sse_written_at: string,    // ISO — when THIS connection got the frame written
 *   replay: boolean,
 *   part_id?: string,          // payload.part.id, when payload carries a part
 *   part_type?: string,        // payload.part.type
 *   call_id?: string,          // payload.part.call_id
 *   tool_name?: string,        // payload.part.tool_name
 *   message_id?: string,       // payload.message_id
 * }
 * ```
 *
 * **client-sse.jsonl** — one record per event the browser's `EventSource`
 * actually dispatched a listener for, captured via a `page.addInitScript`
 * wrap of `window.EventSource` before app code runs. Also per-connection
 * (two `EventSource` instances), so the same `event_id` can legitimately
 * appear twice here too — a real "the browser socket received this frame on
 * both connections" fact, not a driver bug; {@link computeVerdict} takes the
 * earliest `ts` per `(event_id, part_id)` when it matters.
 * ```
 * {
 *   recv_at: string,      // ISO — wall clock the page's listener fired
 *   type: string,         // the SSE `event:` name the listener matched
 *   lastEventId: string,  // == server event_id
 *   part_id?: string,
 *   part_type?: string,
 *   call_id?: string,
 *   tool_name?: string,
 *   message_id?: string,
 * }
 * ```
 *
 * **dom-timeline.jsonl** — one record per MutationObserver-observed change
 * to a transcript part element (`.kit-partcard[data-kind]`,
 * `[data-testid^="part-"]`, `.part-collapsible` for thinking). As of
 * gact-tui#364's client-half fix, the tool row (`[data-testid="part-tool"]`,
 * `[data-testid="tool-wait-activity"]`) DOES carry its own `call_id` as
 * `data-call-id` (`apps/web/src/transcript/parts/ToolPart.tsx`) — the driver
 * collects it as `callId` below, and {@link matchDomRowsToCalls} prefers an
 * EXACT join on it over the positional/text heuristic, falling back to that
 * heuristic only for rows the id join can't place (an older capture with no
 * `data-call-id`, or a row whose id genuinely doesn't match any known call).
 * ```
 * {
 *   t: string,           // ISO — wall clock of the MutationObserver callback
 *   op: string,          // 'add' | 'attr' | 'text'
 *   testid?: string,     // data-testid, when present
 *   kind?: string,       // data-kind (PartCard), when present — 'tool' | 'thinking' | ...
 *   pending?: boolean,   // true when a `.part-toolrow__pending` ("running…") node is present
 *   textHead: string,    // first ~80 chars of the element's textContent
 *   callId?: string,     // data-call-id, when the element carries one
 * }
 * ```
 *
 * **stream-audit.jsonl** — a straight copy of the server's
 * `CLIO_STREAM_AUDIT_LOG` for the run window (already JSONL: `{ts, iso,
 * stage, ...fields}` per `runtime/stream_audit.py`). Consulted for
 * `discard_open_text` / `dropped_empty_part` / collector-collapse evidence
 * (#362) rather than for `t_*` timing directly.
 *
 * ## Verdict classes (issue #364)
 *
 * - `server-late` — the server itself never gave the started event a real
 *   window before the result (or never published one this capture can see
 *   at all).
 * - `transport-lost` — the server published a started event the browser's
 *   own `EventSource` never received.
 * - `render-late` — server and client both saw the started event in good
 *   time, but the DOM never showed a distinct in-flight row before the
 *   result landed (or showed one too close to/after it).
 * - `not-reproduced` — a distinct in-flight row WAS shown, with a real gap
 *   before the result. This is the acceptance-bar class post-fix.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Verdict class literals, exported so callers/tests never hand-type strings. */
export const VERDICT_CLASSES = /** @type {const} */ ([
  'server-late',
  'transport-lost',
  'render-late',
  'not-reproduced',
]);

export const DEFAULT_THRESHOLDS = Object.freeze({
  /** Minimum gap (ms) between t_dom and t_result for the in-flight row to
   *  count as genuinely shown live, rather than rendered coincident with
   *  (or after) completion. */
  minVisibleGapMs: 250,
  /** Minimum gap (ms) between t_published (server) and t_result for the
   *  server's own started-event window to count as a real window rather
   *  than a start-and-finish-together non-event. */
  minServerWindowMs: 250,
});

function toEpochMs(iso) {
  if (iso === undefined || iso === null || iso === '') return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * Dedupe server-sse frames by `event_id`, keeping the row with the earliest
 * `sse_written_at` (the wire tap is per-connection; SessionView opens TWO
 * EventSources, so every server-originated frame appears twice). Rows
 * without an `event_id` pass through untouched — never dropped, since a
 * frame this reducer cannot key is still evidence, just unjoinable.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @returns {Array<Record<string, unknown>>}
 */
export function dedupeServerFrames(rows) {
  const byEventId = new Map();
  const withoutId = [];
  for (const row of rows) {
    const id = row.event_id;
    if (!id) {
      withoutId.push(row);
      continue;
    }
    const existing = byEventId.get(id);
    if (!existing) {
      byEventId.set(id, row);
      continue;
    }
    const existingTs = toEpochMs(existing.sse_written_at) ?? Number.POSITIVE_INFINITY;
    const rowTs = toEpochMs(row.sse_written_at) ?? Number.POSITIVE_INFINITY;
    if (rowTs < existingTs) byEventId.set(id, row);
  }
  return [...withoutId, ...byEventId.values()];
}

/**
 * Classifies one tool_call activity's observed timestamps into a verdict
 * class (issue #364). `times` fields are epoch-ms numbers or
 * `undefined`/`null` for "never observed in that stream". Evaluated in a
 * fixed order — earlier rules win, matching the class definitions above.
 *
 * @param {{ t_published?: number|null, t_received?: number|null, t_dom?: number|null, t_result?: number|null }} times
 * @param {typeof DEFAULT_THRESHOLDS} [thresholds]
 * @returns {(typeof VERDICT_CLASSES)[number]}
 */
export function classifyToolCall(times, thresholds = DEFAULT_THRESHOLDS) {
  const t_published = times.t_published ?? undefined;
  const t_received = times.t_received ?? undefined;
  const t_dom = times.t_dom ?? undefined;
  const t_result = times.t_result ?? undefined;

  if (t_published === undefined && t_received === undefined && t_dom === undefined && t_result === undefined) {
    throw new Error('classifyToolCall: no evidence in any stream for this call — caller bug');
  }

  // 1. The server itself never gave the started event a real window before
  //    completing (or never published one this capture can see at all).
  if (
    t_published === undefined ||
    (t_result !== undefined && t_result - t_published < thresholds.minServerWindowMs)
  ) {
    return 'server-late';
  }

  // 2. Server published in time, but the browser's own EventSource capture
  //    never saw the matching event at all.
  if (t_received === undefined) {
    return 'transport-lost';
  }

  // 3. Both server and client agree the event traveled — did the DOM show a
  //    distinct in-flight row before the result landed (or is it still
  //    running, with no result yet at all)?
  if (t_dom !== undefined && (t_result === undefined || t_result - t_dom >= thresholds.minVisibleGapMs)) {
    return 'not-reproduced';
  }

  // 4. Received in time but the DOM never showed it distinctly (or only
  //    right at/after completion).
  return 'render-late';
}

/**
 * Normalizes one raw server-sse.jsonl record into the common `{ts, event_id,
 * part_id, part_type, call_id, tool_name}` shape used for grouping. `ts` is
 * the DOMAIN publish time (`occurred_at`) — the t_published candidate.
 */
function normalizeServerRow(raw) {
  return {
    ts: toEpochMs(raw.occurred_at),
    event_id: raw.event_id,
    part_id: raw.part_id,
    part_type: raw.part_type,
    call_id: raw.call_id,
    tool_name: raw.tool_name,
  };
}

/** Normalizes one raw client-sse.jsonl record; `ts` is the browser receive time. */
function normalizeClientRow(raw) {
  return {
    ts: toEpochMs(raw.recv_at),
    event_id: raw.lastEventId,
    part_id: raw.part_id,
    part_type: raw.part_type,
    call_id: raw.call_id,
    tool_name: raw.tool_name,
  };
}

/**
 * Groups normalized rows into per-`part_id` "call activities" (tool_call
 * rows keyed by `part_id`, which — per `transcript.py::
 * upsert_repeated_collector_call` — stays STABLE across a collector's
 * re-polls even though `call_id` gets a fresh value each poll) and
 * per-`call_id` result rows (a `tool_result` shares its publishing call's
 * `call_id`, which is what actually pairs a call to its result on the
 * wire). Returns one activity per distinct tool_call `part_id`:
 * `{ part_id, tool_name, t: earliest call ts, callRows, resultRows,
 * lastCallId }`. `resultRows` are every tool_result row sharing the LATEST
 * call's `call_id` — the final completion of the whole activity, including
 * a re-poll chain.
 */
function groupCallActivities(normalizedRows) {
  const callsByPartId = new Map();
  const resultsByCallId = new Map();
  for (const row of normalizedRows) {
    if (row.part_type === 'tool_call' && row.part_id) {
      const list = callsByPartId.get(row.part_id) ?? [];
      list.push(row);
      callsByPartId.set(row.part_id, list);
    } else if (row.part_type === 'tool_result' && row.call_id) {
      const list = resultsByCallId.get(row.call_id) ?? [];
      list.push(row);
      resultsByCallId.set(row.call_id, list);
    }
  }
  const activities = [];
  for (const [partId, callRows] of callsByPartId) {
    const sorted = [...callRows].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const resultRows = resultsByCallId.get(last.call_id) ?? [];
    activities.push({
      part_id: partId,
      tool_name: last.tool_name ?? first.tool_name,
      t: first.ts,
      callRows: sorted,
      resultRows: [...resultRows].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)),
      lastCallId: last.call_id,
    });
  }
  activities.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  return activities;
}

/**
 * Join DOM-observed tool rows to server-observed call activities. As of
 * gact-tui#364's client-half fix, `ToolPart.tsx` stamps its own `call_id` as
 * `data-call-id` on both the settled row (`part-tool`) and the tool-wait
 * activity line (`tool-wait-activity`) — so the PRIMARY join is an exact
 * match on `call_id` (searched from the earliest still-unused row forward,
 * so ties resolve in chronological order). Only when no exact id match
 * exists — an older capture predating the attribute, or a row whose id
 * genuinely names no known call — does this fall back to the ORIGINAL
 * heuristics: a DOM row whose `textHead` contains the call's `tool_name`,
 * then the next unused row in plain chronological order. An activity with
 * no candidate DOM row left maps to `undefined` — "never observed in the
 * DOM timeline at all", never a fabricated match.
 *
 * @param {Array<{part_id: string, tool_name?: string, call_id?: string}>} callActivitiesChronological
 * @param {Array<{t: number, textHead?: string, callId?: string}>} domToolRowsChronological
 * @returns {Map<string, {t: number, textHead?: string, callId?: string}|undefined>}
 */
export function matchDomRowsToCalls(callActivitiesChronological, domToolRowsChronological) {
  const used = new Set();
  const matches = new Map();
  for (const call of callActivitiesChronological) {
    let foundIndex = -1;
    if (call.call_id) {
      for (let i = 0; i < domToolRowsChronological.length; i++) {
        if (used.has(i)) continue;
        if (domToolRowsChronological[i].callId === call.call_id) {
          foundIndex = i;
          break;
        }
      }
    }
    if (foundIndex === -1 && call.tool_name) {
      for (let i = 0; i < domToolRowsChronological.length; i++) {
        if (used.has(i)) continue;
        const row = domToolRowsChronological[i];
        if (row.textHead && row.textHead.includes(call.tool_name)) {
          foundIndex = i;
          break;
        }
      }
    }
    if (foundIndex === -1) {
      for (let i = 0; i < domToolRowsChronological.length; i++) {
        if (!used.has(i)) {
          foundIndex = i;
          break;
        }
      }
    }
    if (foundIndex >= 0) {
      used.add(foundIndex);
      matches.set(call.part_id, domToolRowsChronological[foundIndex]);
    } else {
      matches.set(call.part_id, undefined);
    }
  }
  return matches;
}

/**
 * The main pure entry point: joins the four streams and produces the
 * verdict document. `now` is injectable so tests get a deterministic
 * `generated_at` without mocking global `Date`.
 *
 * @param {{
 *   serverRows: Array<Record<string, unknown>>,
 *   clientRows: Array<Record<string, unknown>>,
 *   domRows: Array<Record<string, unknown>>,
 *   auditRows?: Array<Record<string, unknown>>,
 * }} streams
 * @param {{ thresholds?: typeof DEFAULT_THRESHOLDS, now?: () => string }} [options]
 */
export function computeVerdict(streams, options = {}) {
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const now = options.now ?? (() => new Date().toISOString());
  const serverRowsDeduped = dedupeServerFrames(streams.serverRows ?? []);
  const clientRowsRaw = streams.clientRows ?? [];
  const domRowsRaw = streams.domRows ?? [];

  const normalizedServer = serverRowsDeduped.map(normalizeServerRow);
  const normalizedClient = clientRowsRaw.map(normalizeClientRow);

  const serverActivities = groupCallActivities(normalizedServer);
  const clientActivities = groupCallActivities(normalizedClient);
  const clientActivityByPartId = new Map(clientActivities.map((a) => [a.part_id, a]));

  const domToolRows = domRowsRaw
    .filter((r) => r.kind === 'tool' || r.testid === 'part-tool')
    .map((r) => ({ t: toEpochMs(r.t), textHead: r.textHead, callId: r.callId, raw: r }))
    .filter((r) => r.t !== undefined)
    .sort((a, b) => a.t - b.t);

  const domMatches = matchDomRowsToCalls(
    serverActivities.map((a) => ({ part_id: a.part_id, tool_name: a.tool_name, call_id: a.lastCallId })),
    domToolRows,
  );

  const calls = serverActivities.map((activity) => {
    const t_published = activity.t;
    const t_result = activity.resultRows.length > 0 ? activity.resultRows[0].ts : undefined;

    const clientActivity = clientActivityByPartId.get(activity.part_id);
    const t_received = clientActivity ? clientActivity.t : undefined;

    const domRow = domMatches.get(activity.part_id);
    const t_dom = domRow ? domRow.t : undefined;

    const times = { t_published, t_received, t_dom, t_result };
    return {
      part_id: activity.part_id,
      tool_name: activity.tool_name,
      call_id: activity.lastCallId,
      attempts: activity.callRows.length,
      t_published,
      t_received,
      t_dom,
      t_result,
      verdict: classifyToolCall(times, thresholds),
      server_event_ids: [...new Set(activity.callRows.map((r) => r.event_id).filter(Boolean))],
    };
  });

  // Every server-side event id (post-dedupe) absent client-side, listed
  // explicitly — never silently absorbed into "it worked" or dropped.
  const clientEventIds = new Set(normalizedClient.map((r) => r.event_id).filter(Boolean));
  const server_ids_absent_client_side = [
    ...new Set(
      normalizedServer
        .filter((r) => r.event_id && !clientEventIds.has(r.event_id))
        .map((r) => r.event_id),
    ),
  ];

  // A client-observed event with no server-side event_id at all — reported,
  // never dropped (an unexplained client event is exactly the kind of
  // finding a filtering pipeline would silently swallow).
  const serverEventIds = new Set(normalizedServer.map((r) => r.event_id).filter(Boolean));
  const unexplained_client_events = clientRowsRaw.filter((raw) => {
    const id = raw.lastEventId;
    return !id || !serverEventIds.has(id);
  });

  return {
    generated_at: now(),
    thresholds,
    calls,
    server_ids_absent_client_side,
    unexplained_client_events,
    counts: {
      server_frames_raw: (streams.serverRows ?? []).length,
      server_frames_deduped: serverRowsDeduped.length,
      client_frames: clientRowsRaw.length,
      dom_tool_rows: domToolRows.length,
      audit_rows: (streams.auditRows ?? []).length,
      calls: calls.length,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI wrapper (impure) — reads the four JSONL files from a run directory,
// calls the pure API above, writes verdict.json. Never imported by tests.

async function readJsonl(path) {
  let text;
  try {
    text = await readFile(path, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[verdict] stream file missing, treating as empty: ${path}`);
      return [];
    }
    throw err;
  }
  const rows = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(JSON.parse(trimmed));
  }
  return rows;
}

async function main() {
  const [runDir] = process.argv.slice(2);
  if (!runDir) {
    console.error('usage: node verdict.mjs <runDir>');
    process.exit(2);
  }
  const [serverRows, clientRows, domRows, auditRows] = await Promise.all([
    readJsonl(join(runDir, 'server-sse.jsonl')),
    readJsonl(join(runDir, 'client-sse.jsonl')),
    readJsonl(join(runDir, 'dom-timeline.jsonl')),
    readJsonl(join(runDir, 'stream-audit.jsonl')),
  ]);
  const verdict = computeVerdict({ serverRows, clientRows, domRows, auditRows });
  const outPath = join(runDir, 'verdict.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(verdict, null, 2));
  console.log(`[verdict] wrote ${outPath}`);
  console.log(`[verdict] ${verdict.calls.length} call(s):`);
  for (const call of verdict.calls) {
    console.log(`  ${call.tool_name ?? '?'} (${call.part_id}) -> ${call.verdict}`);
  }
  if (verdict.server_ids_absent_client_side.length > 0) {
    console.log(
      `[verdict] ${verdict.server_ids_absent_client_side.length} server event id(s) never seen client-side`,
    );
  }
  if (verdict.unexplained_client_events.length > 0) {
    console.log(
      `[verdict] ${verdict.unexplained_client_events.length} unexplained client event(s) with no server event_id match`,
    );
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
