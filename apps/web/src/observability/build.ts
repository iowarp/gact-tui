import type {
  SemanticEventPayload,
  SessionAgentTask,
  SessionArtifactRecord,
  SessionArtifactVersion,
  SessionTraceEvent,
} from '@clio/core';
import type {
  ObsArtifactRow,
  ObsNavigation,
  ObsSpan,
  ObsSpanState,
  ObsTimelineRow,
  ObsToolCallRow,
  ObsToolCallState,
  ObsToolInventory,
  ObsToolInventoryRow,
} from './types';

const TERMINAL_TASK_STATES = new Set([
  'cancelled',
  'canceled',
  'completed',
  'done',
  'error',
  'failed',
  'succeeded',
]);
const FAILED_TASK_STATES = new Set(['cancelled', 'canceled', 'error', 'failed']);

/** One session's durable semantic trace (GET /v1/sessions/{sid}/trace). */
export interface SessionTraceEvents {
  sessionId: string;
  events: SemanticEventPayload[];
}

export interface ObservabilityTraceInput {
  /** The session whose observability layer is open — depth 0, agent "main". */
  rootSessionId: string;
  /** The root session's trace plus every child session's trace. */
  traces: SessionTraceEvents[];
  agentTasks: SessionAgentTask[];
  artifacts: SessionArtifactRecord[];
}

export interface ObservabilityTrace {
  timeline: ObsTimelineRow[];
  spans: ObsSpan[];
  artifactRows: ObsArtifactRow[];
  toolCalls: ObsToolCallRow[];
  toolInventory: ObsToolInventory;
}

/** Which trace session a row was recorded in, and what that session is to
 *  the observed tree: the root itself (depth 0, "main") or a child session
 *  mapped by an agent-task record (its `depth`, its run label). */
interface TraceSessionMeta {
  sessionId: string;
  root: boolean;
  depth: number;
  agent: string;
  nav?: ObsNavigation;
}

/**
 * Build the observability layer from the session tree's semantic traces —
 * the ONE source (gact-tui#356): the root session's trace plus each child's,
 * merged strictly chronologically by every event's own `occurred_at`. The
 * former transcript-parts seeding is deleted with this; parts carry message
 * timestamps, not per-event ones, and never descend into children.
 */
export function buildObservabilityTrace({
  rootSessionId,
  traces,
  agentTasks,
  artifacts,
}: ObservabilityTraceInput): ObservabilityTrace {
  const metaById = sessionMetaById(rootSessionId, agentTasks);
  const agentLookup = agentSessionLookup(agentTasks);
  const versions = artifacts.map(latestArtifactVersion).filter(isPresent);

  const timeline: ObsTimelineRow[] = [];
  const toolCalls: ObsToolCallRow[] = [];
  const usedArtifactRows: ObsArtifactRow[] = [];
  for (const trace of traces) {
    const meta = metaById.get(trace.sessionId) ?? fallbackMeta(trace.sessionId);
    timeline.push(...timelineRowsFromTrace(trace, meta, agentLookup));
    toolCalls.push(...toolCallRowsFromTrace(trace, meta));
    for (const event of trace.events) {
      const row = usedArtifactRowFromEvent(event, meta);
      if (row) usedArtifactRows.push(row);
    }
  }

  const rootTrace = traces.find((trace) => trace.sessionId === rootSessionId);
  const spans = assembleSpans(rootTrace, traces, agentTasks, versions);

  const mintedArtifactRows = versions
    .slice()
    .sort(
      (left, right) =>
        (parseTimestamp(left.version.created_at) ?? Number.POSITIVE_INFINITY) -
        (parseTimestamp(right.version.created_at) ?? Number.POSITIVE_INFINITY),
    )
    .map((entry) => toArtifactRow(entry.record, entry.version, agentTasks));

  return {
    timeline: sortTimelineRows(timeline),
    spans,
    // Minted versions AND same-sha dedup reuse, one chronological list — a
    // child re-staging an artifact main already minted is a real, distinct
    // fact (`artifact.used`, clio versions.py#1191) that had NO surface
    // anywhere in the UI before this (round-8 owner finding: "reuse
    // happened and is invisible"). `used` rows render visually muted,
    // tagged `used (dedup)`, never confused with a mint.
    artifactRows: [...mintedArtifactRows, ...usedArtifactRows].sort(
      (left, right) => (left.atMs ?? Number.POSITIVE_INFINITY) - (right.atMs ?? Number.POSITIVE_INFINITY),
    ),
    toolCalls: toolCalls
      .slice()
      .sort(
        (left, right) =>
          (left.atMs ?? Number.POSITIVE_INFINITY) - (right.atMs ?? Number.POSITIVE_INFINITY),
      ),
    toolInventory: toolInventoryFromTraces(traces),
  };
}

/** Root = depth 0 / "main"; children = the agent-task record's own depth and
 *  run label. A traced session with no task record (reached only through the
 *  artifacts route's child_session_ids) gets the honest minimum: depth 1 and
 *  its session id as the label — never a guessed name. */
function sessionMetaById(
  rootSessionId: string,
  agentTasks: SessionAgentTask[],
): Map<string, TraceSessionMeta> {
  const meta = new Map<string, TraceSessionMeta>();
  meta.set(rootSessionId, { sessionId: rootSessionId, root: true, depth: 0, agent: 'main' });
  for (const task of agentTasks) {
    const sessionId = visibleString(task.child_session_id ?? null);
    if (!sessionId || meta.has(sessionId)) continue;
    meta.set(sessionId, {
      sessionId,
      root: false,
      depth: finiteNumber(task.depth) ?? 1,
      agent:
        visibleString(task.run_label ?? null) ??
        visibleString(task.agent_ref?.expert_id ?? null) ??
        sessionId,
      nav: { kind: 'agent', targetId: sessionId },
    });
  }
  return meta;
}

function fallbackMeta(sessionId: string): TraceSessionMeta {
  return {
    sessionId,
    root: false,
    depth: 1,
    agent: sessionId,
    nav: { kind: 'agent', targetId: sessionId },
  };
}

/** child_session_id keyed by every real name a timeline actor might carry
 *  for that task (run_label, expert_id, handle_id, task_id) — the prototype's
 *  `childViews[r.jump || r.name]` lookup, backed by the real agent-task
 *  projection instead of a hardcoded demo dict. */
function agentSessionLookup(agentTasks: SessionAgentTask[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const task of agentTasks) {
    const sessionId = visibleString(task.child_session_id ?? null);
    if (!sessionId) continue;
    for (const key of [
      task.run_label,
      task.agent_ref?.expert_id,
      task['handle_id'],
      task.task_id,
      task.id,
    ]) {
      const name = visibleString(key ?? null);
      if (name && !lookup.has(name)) lookup.set(name, sessionId);
    }
  }
  return lookup;
}

// ---- timeline ----

/** Strict chronological order by each row's raw occurred-at ms; rows with no
 *  timestamp sort after every timed row. The sort is stable, so same-instant
 *  rows keep their per-trace emit order. */
export function sortTimelineRows(rows: ObsTimelineRow[]): ObsTimelineRow[] {
  return rows
    .slice()
    .sort(
      (left, right) =>
        (left.atMs ?? Number.POSITIVE_INFINITY) - (right.atMs ?? Number.POSITIVE_INFINITY),
    );
}

/** Merge live SSE-appended rows into the seeded timeline: drop replays, then
 *  re-sort chronologically — the fix for the append path that used to
 *  concatenate segments unsorted.
 *
 *  Two replay guards, both structural:
 *  - identical sourceId (the same event delivered twice on one stream);
 *  - the seed watermark: the trace read is authoritative for everything up
 *    to its newest event, and the SSE stream replays a backlog on connect
 *    whose copies of those same logical events carry DIFFERENT event_id /
 *    occurred_at stamps than the ARC log's (live-verified ~300ms apart), so
 *    id equality cannot catch them. A live row at or before the watermark —
 *    padded by the measured cross-surface stamp skew, since the highway's
 *    copy of the seed's own NEWEST event lands a few hundred ms past it —
 *    is history the seed already covers; only rows beyond are genuinely
 *    new. (A real event inside the skew window is picked up by the next
 *    re-seed; the live lane is a transient overlay, not the record.) */
const SSE_TRACE_STAMP_SKEW_MS = 2_000;

export function mergeTimelineRows(
  seeded: ObsTimelineRow[],
  live: ObsTimelineRow[],
): ObsTimelineRow[] {
  const newest = seeded.reduce(
    (max, row) => (row.atMs !== undefined && row.atMs > max ? row.atMs : max),
    Number.NEGATIVE_INFINITY,
  );
  const watermark = newest + SSE_TRACE_STAMP_SKEW_MS;
  const seen = new Set(seeded.map((row) => row.sourceId).filter(isPresentString));
  const fresh = live.filter((row) => {
    if (row.atMs !== undefined && row.atMs <= watermark) return false;
    if (!row.sourceId) return true;
    if (seen.has(row.sourceId)) return false;
    seen.add(row.sourceId);
    return true;
  });
  return sortTimelineRows([...seeded, ...fresh]);
}

function timelineRowsFromTrace(
  trace: SessionTraceEvents,
  meta: TraceSessionMeta,
  agentLookup: Map<string, string>,
): ObsTimelineRow[] {
  const startedByCall = new Map<string, SemanticEventPayload>();
  for (const event of trace.events) {
    if (event.event_type !== 'tool.call.started') continue;
    const callId = visibleString(payloadOf(event)['call_id']);
    if (callId) startedByCall.set(callId, event);
  }
  const completedCallIds = new Set(
    trace.events
      .filter((event) => event.event_type === 'tool.call.completed')
      .map((event) => visibleString(payloadOf(event)['call_id']))
      .filter(isPresent),
  );

  const rows: ObsTimelineRow[] = [];
  for (const event of trace.events) {
    if (event.event_type === 'tool.call.started') {
      // A started call whose completion is also in this trace is represented
      // once, by the completion (it carries ok + duration). Only a genuinely
      // unfinished call renders its own running row.
      const callId = visibleString(payloadOf(event)['call_id']);
      if (callId && completedCallIds.has(callId)) continue;
    }
    const row = timelineRowFromSemanticEvent(event, meta, agentLookup);
    if (!row) continue;
    if (event.event_type === 'tool.call.completed') {
      // The row REPRESENTS the call, so it sorts at the call's real start
      // (the same anchor the tools tab uses) — a completion-stamped row
      // would sort after artifacts the call itself produced mid-execution.
      const started = startedByCall.get(visibleString(payloadOf(event)['call_id']) ?? '');
      const startAt = started ? withTime(started.occurred_at) : null;
      rows.push(startAt?.atMs !== undefined ? { ...row, ...startAt } : row);
      continue;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Map one semantic trace event to a visible timeline row, or null for event
 * types the timeline does not render (hooks, lm internals, react steps, …).
 *
 * The curated set is typed on `event_type` only — never on prose:
 * - root session only: `turn.started` (the user's own turn, quoting the real
 *   prompt), `routing.decision`, `turn.completed` — a child session's own
 *   turn bookkeeping is already represented by its delegation rows.
 * - every session: `tool.call.completed` (+ unfinished `tool.call.started`),
 *   `blueprint.delegation.started`/`completed` (the branch open/close rows),
 *   and `artifact.created`.
 */
export function timelineRowFromSemanticEvent(
  event: SemanticEventPayload,
  meta: Pick<TraceSessionMeta, 'root' | 'depth' | 'nav' | 'sessionId'>,
  agentLookup?: Map<string, string>,
): ObsTimelineRow | null {
  const payload = payloadOf(event);
  const subject = (event.subject ?? {}) as Record<string, unknown>;
  const common = {
    ...withTime(event.occurred_at),
    depth: meta.depth,
    sourceId: semanticSourceId(event, meta.sessionId),
  };

  if (event.event_type === 'turn.started' && meta.root) {
    const text = visibleString(payload['text']);
    if (!text) return null;
    const messageId = visibleString(subject['message_id']) ?? visibleString(event.turn_id);
    return {
      ...common,
      actor: 'user',
      action: quoteExcerpt(text),
      kind: 'user',
      ...(messageId ? { nav: { kind: 'message', targetId: messageId } as ObsNavigation } : {}),
    };
  }

  if (event.event_type === 'routing.decision' && meta.root) {
    const source = visibleString(payload['route_source']);
    const selected = visibleString(payload['selected_agent']);
    const action =
      source && selected
        ? `${source} → ${selected}`
        : (visibleString(event.summary) ?? 'routing decision');
    return { ...common, actor: 'routing_decision', action, kind: 'event' };
  }

  if (event.event_type === 'turn.completed' && meta.root) {
    const stop = visibleString(payload['stop_reason']);
    return {
      ...common,
      actor: 'turn.completed',
      action: stop ? `stop_reason ${stop}` : (visibleString(event.summary) ?? 'turn completed'),
      kind: 'event',
    };
  }

  if (event.event_type === 'tool.call.completed' || event.event_type === 'tool.call.started') {
    const tool = visibleString(payload['tool']);
    if (!tool) return null;
    const running = event.event_type === 'tool.call.started';
    const failed = !running && payload['ok'] === false;
    const duration = durationFromMs(payload['duration_ms']);
    const turnId = visibleString(event.turn_id);
    const nav = meta.nav ?? (turnId ? ({ kind: 'message', targetId: turnId } as ObsNavigation) : undefined);
    return {
      ...common,
      actor: tool,
      action: failed ? 'tool call failed' : 'tool call',
      kind: running ? 'running' : failed ? 'failure' : 'tool',
      ...(duration ? { duration } : {}),
      ...(nav ? { nav } : {}),
    };
  }

  if (event.event_type === 'blueprint.delegation.started') {
    const child = visibleString(subject['agent_id']) ?? 'child agent';
    return {
      ...common,
      actor: child,
      action: 'task started',
      kind: 'running',
      branch: 'open',
      ...agentNav(agentLookup, [child, visibleString(payload['task_id'])]),
    };
  }

  if (event.event_type === 'blueprint.delegation.completed') {
    const actor = (event.actor ?? {}) as Record<string, unknown>;
    const child =
      visibleString(payload['agent_id']) ?? visibleString(actor['agent_id']) ?? 'child agent';
    const parent = visibleString(payload['parent_id']) ?? 'parent';
    const status = visibleString(payload['status']);
    return {
      ...common,
      actor: child,
      action: `returned to ${parent}`,
      kind: status && FAILED_TASK_STATES.has(status.toLowerCase()) ? 'failure' : 'event',
      branch: 'close',
      ...agentNav(agentLookup, [visibleString(payload['task_id']), child]),
    };
  }

  if (event.event_type === 'artifact.created') {
    const name = visibleString(subject['name']) ?? visibleString(payload['name']);
    if (!name) return null;
    const size = finiteNumber(payload['size_bytes']);
    return {
      ...common,
      actor: name,
      action: size !== null ? `artifact (${formatBytes(size)})` : 'artifact',
      kind: 'artifact',
    };
  }

  return null;
}

/** Map one live session SSE event to a timeline row (or null for uncurated
 *  semantic events). Live rows are always the observed session's own stream,
 *  so they carry the root's meta; a session.status_changed keeps its
 *  dedicated status row. */
export function timelineRowFromSessionTraceEvent(event: SessionTraceEvent): ObsTimelineRow | null {
  if (event.type === 'session.status_changed') {
    const status = event.payload.status;
    return {
      ...withTime(event.occurred_at),
      actor: 'session',
      action: `status changed to ${status}`,
      kind: /fail|error|blocked|cancel/.test(String(status ?? '').toLowerCase())
        ? 'failure'
        : 'event',
      depth: 0,
      sourceId: `status:${event.occurred_at}:${status}`,
    };
  }
  const payload = event.payload;
  return timelineRowFromSemanticEvent(
    { ...payload, occurred_at: payload.occurred_at ?? event.occurred_at },
    { root: true, depth: 0, sessionId: visibleString(payload.session_id) ?? '' },
  );
}

/** The prototype's `else if (cv[r.jump || r.name]) go = () => this.goView(jk)`
 *  — an "Open agent" nav, only ever attached when a real agent-task record
 *  names this exact actor/task as the key to a child session. Never guessed
 *  from string similarity. */
function agentNav(
  lookup: Map<string, string> | undefined,
  candidates: Array<string | null | undefined>,
): { nav: ObsNavigation } | Record<string, never> {
  if (!lookup) return {};
  for (const key of candidates) {
    if (!key) continue;
    const sessionId = lookup.get(key);
    if (sessionId) return { nav: { kind: 'agent', targetId: sessionId } };
  }
  return {};
}

/** The prototype's opening user row quotes the question, truncated with an
 *  ellipsis (proto-obs.json: '"What recent ground-motion is…"'). */
function quoteExcerpt(text: string, max = 90): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const truncated = collapsed.length > max ? `${collapsed.slice(0, max).trimEnd()}…` : collapsed;
  return `"${truncated}"`;
}

/** Stable identity for one semantic event — the trace and the live SSE
 *  stream publish the same payload dicts, so seeding and live-append derive
 *  the SAME id and reconnect replays deduplicate against the seed. */
function semanticSourceId(event: SemanticEventPayload, fallbackSessionId: string): string {
  const sessionId = visibleString(event.session_id) ?? fallbackSessionId;
  const anchor =
    visibleString(payloadOf(event)['call_id']) ??
    visibleString(((event.subject ?? {}) as Record<string, unknown>)['call_id']) ??
    visibleString(event.event_id) ??
    '';
  return `sem:${sessionId}:${event.event_type}:${event.occurred_at ?? ''}:${anchor}`;
}

// ---- tools tab: chronological call log across the tree ----

/**
 * One row per real tool call in this trace session — `tool.call.started`
 * paired to its `tool.call.completed` by `call_id`. The wire's own payload
 * keys: `tool` (NOT tool_name), `ok`, `duration_ms`, `call_id`. Row time is
 * the call's real start; a call with no completion renders running.
 */
function toolCallRowsFromTrace(
  trace: SessionTraceEvents,
  meta: TraceSessionMeta,
): ObsToolCallRow[] {
  interface PendingCall {
    started?: SemanticEventPayload;
    completed?: SemanticEventPayload;
    order: number;
  }
  const calls = new Map<string, PendingCall>();
  let order = 0;
  for (const event of trace.events) {
    if (event.event_type !== 'tool.call.started' && event.event_type !== 'tool.call.completed') {
      continue;
    }
    const payload = payloadOf(event);
    const callId =
      visibleString(payload['call_id']) ?? `${event.event_type}:${event.occurred_at ?? order}`;
    const entry = calls.get(callId) ?? { order: order++ };
    if (event.event_type === 'tool.call.started') entry.started = event;
    else entry.completed = event;
    calls.set(callId, entry);
  }

  const rows: ObsToolCallRow[] = [];
  for (const [callId, { started, completed }] of calls) {
    const anchor = started ?? completed;
    if (!anchor) continue;
    const payload = payloadOf(completed ?? anchor);
    const name = visibleString(payload['tool']) ?? visibleString(payloadOf(anchor)['tool']);
    if (!name) continue;
    // `tool_title` is an OPTIONAL wire field a tool server stamps onto the
    // call (same field the transcript's own tool rows read) — same
    // completed-preferred-over-started precedence as `name` above, since
    // either payload may carry it.
    const title = visibleString(payload['tool_title']) ?? visibleString(payloadOf(anchor)['tool_title']);
    const atMs = parseTimestamp(anchor.occurred_at);
    const state: ObsToolCallState = !completed
      ? 'running'
      : payloadOf(completed)['ok'] === false
        ? 'failed'
        : 'done';
    const duration = completed ? durationFromMs(payloadOf(completed)['duration_ms']) : null;
    const argHint = started ? toolArgHint(payloadOf(started)['args']) : null;
    const turnId = visibleString(anchor.turn_id);
    const nav = meta.nav ?? (turnId ? ({ kind: 'message', targetId: turnId } as ObsNavigation) : undefined);
    rows.push({
      sourceId: `trace-tool:${trace.sessionId}:${callId}`,
      ...withTime(anchor.occurred_at),
      ...(atMs !== null ? { atMs } : {}),
      name,
      ...(title ? { title } : {}),
      ...(argHint ? { argHint } : {}),
      agent: meta.agent,
      state,
      ...(duration ? { duration } : {}),
      ...(nav ? { nav } : {}),
    });
  }
  return rows;
}

/** A short, real rendering of the call's own first input key/value — never a
 *  fabricated description of what the tool does. `args` is the trace's own
 *  field name on tool.call.started. */
function toolArgHint(args: unknown): string | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const entries = Object.entries(args as Record<string, unknown>);
  if (entries.length === 0) return null;
  const [key, value] = entries[0]!;
  const rendered = typeof value === 'string' ? value : JSON.stringify(value);
  if (rendered === undefined) return null;
  const truncated = rendered.length > 40 ? `${rendered.slice(0, 40)}…` : rendered;
  return `${key}=${truncated}`;
}

// ---- tools tab: built toolset inventory ("available") ----

/**
 * Parse every `agent.toolset.recorded` event across the given traces (the
 * SAME root + child-session trace set every other tab reads) into one group
 * per agent — verbatim server data, no client-side composition or inference.
 *
 * Grouping key is the event's own `payload.agent_id` (never a looked-up
 * display label). Render order is first-seen across `traces`, which the
 * caller already orders root-then-children (SessionView.loadObservability),
 * so "main first, then children by first-seen order" falls out for free.
 * When an agent rebuilds mid-session (a re-run of the same react module),
 * later events for the SAME agent_id replace earlier ones — the inventory
 * reflects the LATEST built toolset, never a stale union of every build.
 *
 * Session-tree scoping (main sees the whole tree; a child's own obs view
 * sees only itself + its children) is NOT decided here — it falls out of
 * which traces the caller fetched (gact-tui#356's existing scoping), so this
 * function stays a pure, verbatim projection of whatever traces it is given.
 */
function toolInventoryFromTraces(traces: SessionTraceEvents[]): ObsToolInventory {
  const order: string[] = [];
  const toolsByAgent = new Map<string, ObsToolInventoryRow[]>();
  for (const trace of traces) {
    for (const event of trace.events) {
      if (event.event_type !== 'agent.toolset.recorded') continue;
      const payload = payloadOf(event);
      const agentId = visibleString(payload['agent_id']);
      if (!agentId) continue;
      if (!toolsByAgent.has(agentId)) order.push(agentId);
      toolsByAgent.set(agentId, toolInventoryRowsFromPayload(payload['tools']));
    }
  }
  return { groups: order.map((agentId) => ({ agentId, tools: toolsByAgent.get(agentId) ?? [] })) };
}

/** One `agent.toolset.recorded` event's `tools` array, mapped verbatim — a
 *  malformed/missing entry is dropped rather than rendered with invented
 *  fields (a nameless tool row is not a real tool). */
function toolInventoryRowsFromPayload(value: unknown): ObsToolInventoryRow[] {
  if (!Array.isArray(value)) return [];
  const rows: ObsToolInventoryRow[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const name = visibleString(row['name']);
    if (!name) continue;
    const title = visibleString(row['title']);
    const source = visibleString(row['source']) ?? 'unknown';
    const representation = visibleString(row['representation']) ?? 'row';
    rows.push({ name, source, representation, ...(title ? { title } : {}) });
  }
  return rows;
}

// ---- gantt: turn roots, nested agents, real-time bars/marks ----

interface PairedToolCall {
  callId: string;
  tool: string;
  startMs: number;
  endMs: number | null;
  failed: boolean;
  turnId: string | null;
  duration: string | null;
}

/** Pair a trace's tool.call.started/completed by call_id into real windows:
 *  start = the started event's own occurred_at, end = start + the wire's
 *  duration_ms (falling back to the completion's occurred_at). */
function pairedToolCalls(trace: SessionTraceEvents): PairedToolCall[] {
  const byCall = new Map<string, { started?: SemanticEventPayload; completed?: SemanticEventPayload }>();
  for (const event of trace.events) {
    if (event.event_type !== 'tool.call.started' && event.event_type !== 'tool.call.completed') {
      continue;
    }
    const callId = visibleString(payloadOf(event)['call_id']);
    if (!callId) continue;
    const entry = byCall.get(callId) ?? {};
    if (event.event_type === 'tool.call.started') entry.started = event;
    else entry.completed = event;
    byCall.set(callId, entry);
  }

  const out: PairedToolCall[] = [];
  for (const [callId, { started, completed }] of byCall) {
    const anchor = started ?? completed;
    if (!anchor) continue;
    const payload = payloadOf(completed ?? anchor);
    const tool = visibleString(payload['tool']) ?? visibleString(payloadOf(anchor)['tool']);
    if (!tool) continue;
    const durationMs = completed ? finiteNumber(payloadOf(completed)['duration_ms']) : null;
    const completedAt = completed ? parseTimestamp(completed.occurred_at) : null;
    let startMs = started ? parseTimestamp(started.occurred_at) : null;
    if (startMs === null && completedAt !== null) {
      // No started event survived the trace bound: derive the real start
      // from the completion's own timestamp minus its reported duration.
      startMs = durationMs !== null ? completedAt - durationMs : completedAt;
    }
    if (startMs === null) continue;
    const endMs =
      completed === undefined
        ? null
        : durationMs !== null
          ? startMs + durationMs
          : completedAt !== null && completedAt >= startMs
            ? completedAt
            : startMs;
    out.push({
      callId,
      tool,
      startMs,
      endMs,
      failed: completed !== undefined && payload['ok'] === false,
      turnId: visibleString(anchor.turn_id),
      duration: durationMs !== null ? formatDuration(durationMs) : null,
    });
  }
  return out.sort((left, right) => left.startMs - right.startMs);
}

/**
 * The gantt's span list: one `main · turn N` root per root-trace turn
 * (turn.started paired to turn.completed by turn_id), then — nested beneath,
 * in chronological order — the root's own tool calls as bars (spawn/wait/…,
 * each positioned at its REAL tool.call.started time with width = real
 * duration_ms, so a wait bar visibly covers the child window it blocked on)
 * interleaved with the child-agent spans mapped by the agent-task records.
 * Child domain tools ride their agent's lane as wrench marks at real times.
 */
function assembleSpans(
  rootTrace: SessionTraceEvents | undefined,
  traces: SessionTraceEvents[],
  agentTasks: SessionAgentTask[],
  versions: Array<{ record: SessionArtifactRecord; version: SessionArtifactVersion }>,
): ObsSpan[] {
  // Child-agent spans from the task records, with real per-call tool marks
  // from each child's own trace.
  const toolMarksBySession = new Map<string, Array<{ atMs: number; label: string }>>();
  for (const trace of traces) {
    if (trace.sessionId === rootTrace?.sessionId) continue;
    toolMarksBySession.set(
      trace.sessionId,
      pairedToolCalls(trace).map((call) => ({ atMs: call.startMs, label: call.tool })),
    );
  }
  interface TaskSpanEntry {
    span: ObsSpan;
    turnId: string | null;
  }
  const taskSpans: TaskSpanEntry[] = agentTasks.flatMap((task) => {
    const span = toTaskSpan(task, versions);
    if (!span) return [];
    const childId = visibleString(task.child_session_id ?? null);
    const marks = childId ? toolMarksBySession.get(childId) : undefined;
    return [
      {
        span: marks && marks.length > 0 ? { ...span, toolMarks: marks } : span,
        turnId: visibleString(task['parent_turn_id']) ?? null,
      },
    ];
  });

  // Root turn spans + the root's own tool bars.
  interface TurnSpanEntry {
    turnId: string;
    span: ObsSpan;
  }
  const turns: TurnSpanEntry[] = [];
  const rootToolSpans: Array<{ span: ObsSpan; turnId: string | null }> = [];
  if (rootTrace) {
    const completedByTurn = new Map<string, SemanticEventPayload>();
    for (const event of rootTrace.events) {
      if (event.event_type !== 'turn.completed') continue;
      const turnId = visibleString(event.turn_id);
      if (turnId) completedByTurn.set(turnId, event);
    }
    for (const event of rootTrace.events) {
      if (event.event_type !== 'turn.started') continue;
      // The envelope's turn_id; older events may only name the user message
      // (the turn id IS the user message id) on their subject.
      const turnId =
        visibleString(event.turn_id) ??
        visibleString(((event.subject ?? {}) as Record<string, unknown>)['message_id']);
      const startMs = parseTimestamp(event.occurred_at);
      if (!turnId || startMs === null) continue;
      const completion = completedByTurn.get(turnId);
      const endMs = completion ? parseTimestamp(completion.occurred_at) : null;
      const settled = endMs !== null && endMs >= startMs;
      turns.push({
        turnId,
        span: {
          id: `turn:${turnId}`,
          label: `main · turn ${turns.length + 1}`,
          depth: 0,
          startMs,
          endMs: settled ? endMs : null,
          state: settled ? 'done' : 'running',
          ...(settled ? { duration: formatDuration(endMs - startMs) } : {}),
          nav: { kind: 'message', targetId: turnId },
        },
      });
    }

    for (const call of pairedToolCalls(rootTrace)) {
      rootToolSpans.push({
        turnId: call.turnId,
        span: {
          id: `tool:${rootTrace.sessionId}:${call.callId}`,
          label: call.tool,
          depth: 1,
          startMs: call.startMs,
          endMs: call.endMs,
          state: call.endMs === null ? 'running' : call.failed ? 'failed' : 'done',
          ...(call.duration ? { duration: call.duration } : {}),
          tool: true,
          ...(call.turnId ? { nav: { kind: 'message', targetId: call.turnId } as ObsNavigation } : {}),
        },
      });
    }
  }

  // Assemble: each turn root followed by its members (root tool bars +
  // child-agent spans) in chronological order; members with no known turn
  // (or no turn roots at all, e.g. ARC unavailable) append chronologically.
  const memberEntries = [...rootToolSpans, ...taskSpans];
  const consumed = new Set<number>();
  const spans: ObsSpan[] = [];
  for (const turn of turns) {
    spans.push(turn.span);
    const members = memberEntries
      .map((entry, index) => ({ ...entry, index }))
      .filter((entry) => !consumed.has(entry.index) && entry.turnId === turn.turnId)
      .sort((left, right) => left.span.startMs - right.span.startMs);
    for (const member of members) {
      consumed.add(member.index);
      spans.push(member.span);
    }
  }
  const leftovers = memberEntries
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => !consumed.has(entry.index))
    .sort((left, right) => left.span.startMs - right.span.startMs);
  spans.push(...leftovers.map((entry) => entry.span));
  return spans;
}

function toTaskSpan(
  task: SessionAgentTask,
  versions: Array<{ record: SessionArtifactRecord; version: SessionArtifactVersion }>,
): ObsSpan | null {
  const startMs = parseTimestamp(task.created_at);
  if (startMs === null) return null;

  const state = taskState(task);
  const parsedEnd =
    state === 'running' ? null : parseTimestamp(task.completed_at ?? task.updated_at);
  const endMs = parsedEnd !== null && parsedEnd >= startMs ? parsedEnd : null;
  if (state !== 'running' && endMs === null) return null;
  const artifactAtMs = versions
    .filter(({ version }) => version.producer?.session_id === task.child_session_id)
    .map(({ version }) => parseTimestamp(version.created_at))
    .filter(isPresent);
  const id = task.task_id || task.id || `task-${startMs}`;
  const label = task.run_label || task.agent_ref?.expert_id || id;
  const childSessionId = visibleString(task.child_session_id ?? null);

  return {
    id,
    label,
    depth: finiteNumber(task.depth) ?? 0,
    startMs,
    endMs,
    state,
    ...(endMs !== null ? { duration: formatDuration(endMs - startMs) } : {}),
    ...(artifactAtMs.length > 0 ? { artifacts: artifactAtMs.length, artifactAtMs } : {}),
    ...(childSessionId ? { nav: { kind: 'agent' as const, targetId: childSessionId } } : {}),
  };
}

function taskState(task: SessionAgentTask): ObsSpanState {
  const value = String(task.status || task.live_state || '').toLowerCase();
  if (FAILED_TASK_STATES.has(value)) return 'failed';
  return TERMINAL_TASK_STATES.has(value) ? 'done' : 'running';
}

// ---- artifacts tab ----

function latestArtifactVersion(
  record: SessionArtifactRecord,
): { record: SessionArtifactRecord; version: SessionArtifactVersion } | null {
  if (record.versions.length === 0) return null;
  const version =
    record.versions.find((item) => item.artifact_id === record.head_artifact_id) ??
    record.versions.find((item) => item.version === record.latest_version) ??
    [...record.versions].sort((left, right) => right.version - left.version)[0];
  return version ? { record, version } : null;
}

function toArtifactRow(
  record: SessionArtifactRecord,
  version: SessionArtifactVersion,
  tasks: SessionAgentTask[],
): ObsArtifactRow {
  return {
    ...withTime(version.created_at),
    name: record.name || version.name,
    producer: artifactProducer(version, tasks),
    meta: artifactMeta(record, version),
    id: version.artifact_id,
  };
}

/**
 * One `artifact.used` semantic event (clio versions.py `emit_artifact_used`,
 * #1191) as an artifacts-tab row, or null for any other event type. Wire
 * shape verified against the emitter: `subject={artifact_id, name,
 * workspace_id}`, `payload={...subject, event_id, version, session_id,
 * reason:"same_sha_dedup"}`. `producer` names the session that DID the
 * dedup use (this trace's own agent label) — there is no minting producer
 * to report, only a use.
 */
function usedArtifactRowFromEvent(
  event: SemanticEventPayload,
  meta: TraceSessionMeta,
): ObsArtifactRow | null {
  if (event.event_type !== 'artifact.used') return null;
  const subject = (event.subject ?? {}) as Record<string, unknown>;
  const payload = payloadOf(event);
  const name = visibleString(subject['name']) ?? visibleString(payload['name']);
  if (!name) return null;
  const id = visibleString(subject['artifact_id']) ?? visibleString(payload['artifact_id']);
  const version = finiteNumber(payload['version']);
  return {
    ...withTime(event.occurred_at),
    name,
    producer: meta.agent,
    meta: version !== null ? `v${version} · dedup` : 'dedup',
    ...(id ? { id } : {}),
    used: true,
  };
}

function artifactProducer(version: SessionArtifactVersion, tasks: SessionAgentTask[]): string {
  const producer = version.producer;
  if (!producer) return 'producer unavailable';
  const task = tasks.find((item) => item.child_session_id === producer.session_id);
  const path = [
    task?.agent_ref?.requesting_expert_id,
    task?.agent_ref?.expert_id,
    producer.tool,
  ].filter((part): part is string => Boolean(part));
  if (path.length > 0) return [...new Set(path)].join(' / ');
  return producer.session_id || producer.call_id || 'producer unavailable';
}

function artifactMeta(record: SessionArtifactRecord, version: SessionArtifactVersion): string {
  if (typeof version.size_bytes === 'number' && Number.isFinite(version.size_bytes)) {
    return formatBytes(version.size_bytes);
  }
  return version.kind || record.kind || `v${version.version}`;
}

// ---- shared primitives ----

function payloadOf(event: SemanticEventPayload): Record<string, unknown> {
  const payload = event.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

function durationFromMs(value: unknown): string | null {
  const durationMs = finiteNumber(value);
  return durationMs !== null && durationMs >= 0 ? formatDuration(durationMs) : null;
}

function withTime(value: unknown): { at?: string; atMs?: number } {
  const timestamp =
    typeof value === 'number' && Number.isFinite(value) ? value : parseTimestamp(value);
  const at = formatLocalTime(timestamp);
  return { ...(at ? { at } : {}), ...(timestamp !== null ? { atMs: timestamp } : {}) };
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatLocalTime(timestamp: number | null): string | null {
  if (timestamp === null) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(timestamp);
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${Math.round(durationMs)}ms`;
  const seconds = Math.round(durationMs / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining === 0 ? `${minutes}m` : `${minutes}m ${remaining}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${Math.round(bytes)} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000).toLocaleString('en-US')} KB`;
  const megabytes = bytes / 1_000_000;
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

function visibleString(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return /^\[redacted\](?::\d+ chars)?$/i.test(value) ? null : value;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function isPresentString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}
