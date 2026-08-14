export type AgentStatus = 'running' | 'done' | 'failed' | 'queued';

export interface ObsAgent {
  id: string;
  label: string;
  status: AgentStatus;
  /** Nesting depth in the spawn tree; 0 is the main agent. */
  depth: number;
  duration?: string;
}

/** Where a click on an observability row should take the user — the
 *  prototype's `r.go`/`goTitle` pair (jumpMsg -> scroll transcript,
 *  isArt -> open artifact, childViews[name] -> open agent). Only ever
 *  attached when the target is real: no `nav` means the row renders with
 *  the prototype's own `cursor:default`, never a dead click. */
export interface ObsNavigation {
  kind: 'message' | 'agent';
  /** kind 'message': the transcript message id to scroll to.
   *  kind 'agent': the child session id to switch into. */
  targetId: string;
}

export interface ObsRun {
  id: string;
  agent: string;
  state: string;
  label?: string;
  host?: string;
  duration?: string;
  /** Real, derived-only description line (never fabricated tool prose) —
   *  e.g. "requested by main · 2 artifacts". Absent when nothing real to say. */
  description?: string;
  nav?: ObsNavigation;
}

export interface ObsTool {
  name: string;
  description?: string;
}

export interface ObsArtifact {
  id: string;
  label: string;
  kind?: string;
}

export interface ObsContext {
  usedPercent: number;
  tokens: number;
  limit: number;
  /** Sum of every message's real `cost_usd`; undefined when no message in
   *  this session reported a cost (never fabricated from token counts). */
  costUsd?: number;
}

export type ObsTimelineKind = 'event' | 'tool' | 'artifact' | 'failure' | 'running' | 'user';

export interface ObsTimelineRow {
  at?: string;
  /** The event's raw `occurred_at` in epoch milliseconds — the single sort
   *  key every row (seeded from any session's trace, or appended live off
   *  SSE) is merge-ordered by. Absent only for rows whose source event
   *  carried no timestamp; those sort after every timed row. */
  atMs?: number;
  actor: string;
  action: string;
  duration?: string;
  kind: ObsTimelineKind;
  /** Nesting depth of the session this row's trace event was recorded in —
   *  0 for the observed session itself, the agent-task record's `depth` for
   *  each child (how many ancestor thread rails draw through this row). */
  depth?: number;
  /** The AGENT whose session recorded this row — `'main'` for the observed
   *  session, else the agent-task record's own run label / expert id (the
   *  session meta's `agent`, verbatim). Backs the git-branch rail's per-branch
   *  colour, which must agree with the gantt's lane colour for the same agent.
   *  Absent only for pre-P5 captured fixtures recorded before the field. */
  agent?: string;
  /** This exact row opens ('open': a task-started row, rendered at the
   *  PARENT's depth) or closes ('close': a returned/exited row, rendered
   *  AFTER popping back to the parent's depth) a nesting level — the
   *  prototype's `hasOut`/`hasIn` elbow brackets (~8244025). Undefined for
   *  every row that neither starts nor ends a branch. */
  branch?: 'open' | 'close';
  /** Stable backend identity used to discard SSE reconnect replays. */
  sourceId?: string;
  nav?: ObsNavigation;
}

export type ObsSpanState = 'done' | 'running' | 'failed';

export interface ObsSpan {
  id: string;
  label: string;
  depth: number;
  startMs: number;
  endMs: number | null;
  state: ObsSpanState;
  duration?: string;
  artifacts?: number;
  /** Real creation timestamps for artifact diamonds owned by this span. */
  artifactAtMs?: number[];
  /** Real per-call wrench marks on an agent's lane — each child tool call's
   *  own `occurred_at`, labelled with the wire's tool name. */
  toolMarks?: Array<{ atMs: number; label: string }>;
  tool?: boolean;
  nav?: ObsNavigation;
}

export interface ObsArtifactRow {
  at?: string;
  /** Raw epoch-ms sort key backing `at` — the cross-session chronological
   *  merge (minted versions AND `artifact.used` dedup rows, one list) sorts
   *  on this, the same idiom ObsTimelineRow/ObsToolCallRow already use. */
  atMs?: number;
  name: string;
  producer: string;
  meta: string;
  /** The version's real artifact_id (SessionArtifactVersion.artifact_id) —
   *  wires the row to SessionView.openArtifactById, the same right-panel
   *  channel the transcript's artifact chips use. Optional only for
   *  pre-P5 captured fixtures that predate the viewer wiring; a row with no
   *  id renders honestly disabled rather than a dead-looking click. */
  id?: string;
  /**
   * True for a same-sha dedup REUSE, not a mint — the session's own
   * `artifact.used` semantic event (clio versions.py `emit_artifact_used`,
   * #1191): this session used an existing artifact version rather than
   * producing a new one, so there is no `generated` edge to show, only the
   * use. Absent/false = a real minted version (the pre-existing behavior).
   * Rendered as a visually distinct, muted "used (dedup)" row — these were
   * silently invisible everywhere in the UI before (round-8 owner finding).
   */
  used?: boolean;
}

export type ObsToolCallState = 'done' | 'running' | 'failed';

/** One row of the tools tab's chronological call log — the prototype's
 *  `obsToolRows` (design/prototype/Clio Session.html ~8256494): a real call
 *  made this session, not a static per-server catalog entry. */
export interface ObsToolCallRow {
  sourceId: string;
  at?: string;
  /** The call's raw start `occurred_at` in epoch ms — the cross-session
   *  chronological sort key (HH:mm strings cannot order across midnight). */
  atMs?: number;
  name: string;
  /** Optional display title the tool server stamped onto the tool.call.*
   *  trace payload (`tool_title` — same wire field the transcript's tool
   *  rows already render, owner design 2026-08-05). Present = render bold
   *  title + muted raw name; absent = the raw name alone (old sessions,
   *  pre-dating the field). */
  title?: string;
  /** Short rendering of the call's own input, e.g. `(region="LA")` — real,
   *  never a fabricated description of what the tool does. */
  argHint?: string;
  agent: string;
  state: ObsToolCallState;
  duration?: string;
  nav?: ObsNavigation;
}

/** One row of the tools tab's "available" view — a single entry from the
 *  server's own `agent.toolset.recorded` inventory, carried onto the wire
 *  VERBATIM (name/title/source/representation). `source` is either the
 *  concrete MCP server/namespace name, or one of the literal buckets
 *  `"native"` / `"spawn-runtime"` — never invented or recomposed client-side. */
export interface ObsToolInventoryRow {
  name: string;
  title?: string;
  source: string;
  representation: string;
}

/** One agent's built toolset, keyed by its own real `agent_id` (never a
 *  looked-up display label — the event's own field, verbatim). */
export interface ObsToolInventoryGroup {
  agentId: string;
  tools: ObsToolInventoryRow[];
}

/** The Tools tab's "available" view: the tool surface available to the
 *  observed agent tree, session-tree scoped (main's own view covers every
 *  agent in the tree; a child agent's own obs view covers only that agent
 *  plus its own children — enforced upstream by which traces are fetched,
 *  never filtered client-side here). */
export interface ObsToolInventory {
  /** Render order: the observed session's own agent first (when it built),
   *  then every child agent in first-recorded order. */
  groups: ObsToolInventoryGroup[];
}

/**
 * Independent observability reads that commit into the panel progressively
 * (gact-tui#369) instead of the whole layer waiting on the slowest of the
 * round-7 FANOUT's 7 parallel reads.
 *
 * - `'trace'` is the child-trace-fanout aggregate: agentTasks + artifacts
 *   (the only two that name child session ids) gate the child-trace
 *   fan-out, then the root trace + the session-tasks read (needed to
 *   de-dupe the runs tab's supplementary rows) join it. `buildObservabilityTrace`
 *   computes timeline/spans/artifactRows/toolCalls/toolInventory in ONE pass
 *   over that whole traces list, so it commits as ONE unit — splitting it
 *   further would surface a timeline with no matching runs, or artifact rows
 *   with no toolInventory, which is incoherent, not progressive. Backs the
 *   timeline/runs/tools/gantt/artifacts(P5) tabs.
 * - `'context'` is the one other tab-critical independent read
 *   (fetchSessionContextState) — nothing else depends on it, so it commits
 *   the instant its own fetch settles.
 *
 * The legacy-fixture-only `agents`/`toolsByExpert` reads commit
 * independently too (SessionView.loadObservability) but back no LIVE
 * (non-legacy) tab, so they carry no section of their own here.
 */
export type ObsSection = 'trace' | 'context';

export interface ObservabilityData {
  agents: ObsAgent[];
  runs: ObsRun[];
  /** Tools each expert can reach, keyed by expert id. */
  toolsByExpert: Record<string, ObsTool[]>;
  artifacts: ObsArtifact[];
  context?: ObsContext;
  /** Optional only for compatibility with pre-P5 captured fixtures. */
  timeline?: ObsTimelineRow[];
  /** Optional only for compatibility with pre-P5 captured fixtures. */
  spans?: ObsSpan[];
  /** Optional only for compatibility with pre-P5 captured fixtures. */
  artifactRows?: ObsArtifactRow[];
  /** Optional only for compatibility with pre-P5 captured fixtures. */
  toolCalls?: ObsToolCallRow[];
  /** Optional only for compatibility with pre-P5 captured fixtures / sessions
   *  recorded before agent.toolset.recorded existed. An absent value (or one
   *  with an empty `groups` list) renders the honest unavailable state, never
   *  an empty list presented as "no tools". */
  toolInventory?: ObsToolInventory;
  /**
   * True when one or more of the reads that feed the trace/runs/tools/gantt
   * tabs (the session's own trace, every child session's trace, or the
   * agent-task rows) failed or timed out on this load — set by
   * SessionView.loadObservability's typed fetch outcomes. Distinguishes "the
   * backend genuinely reports nothing" from "we could not read it": under
   * 3-way concurrent-session load a slow/failed trace read rendered as a
   * confident "no trace recorded" while the backend actually held 167 real
   * events (round-6 CONCURRENCY finding,
   * screenshots/round6/2026-08-06_03-25-28-CONCURRENCY-transcript.png).
   * Absent/false = every relevant read succeeded, so an empty tab is a real
   * fact.
   */
  traceReadFailed?: boolean;
  /**
   * True when the artifacts read (fetchSessionArtifacts) failed or timed
   * out on this load. A DIFFERENT read than the ones behind
   * `traceReadFailed` above — the artifacts tab/badge can be resolved while
   * the trace tabs are unavailable, or vice versa, so it earns its own flag
   * rather than overloading `traceReadFailed` (round-7 FANOUT finding: the
   * artifacts tab-strip badge read a confident "0" under load, in the same
   * frame the trace tabs correctly rendered "unavailable — retrying").
   * Absent/false = the artifacts read succeeded, so an empty artifacts tab
   * is a real fact.
   */
  artifactsReadFailed?: boolean;
}
