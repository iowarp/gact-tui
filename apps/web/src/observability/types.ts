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
  name: string;
  producer: string;
  meta: string;
  /** The version's real artifact_id (SessionArtifactVersion.artifact_id) —
   *  wires the row to SessionView.openArtifactById, the same right-panel
   *  channel the transcript's artifact chips use. Optional only for
   *  pre-P5 captured fixtures that predate the viewer wiring; a row with no
   *  id renders honestly disabled rather than a dead-looking click. */
  id?: string;
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
  /** Short rendering of the call's own input, e.g. `(region="LA")` — real,
   *  never a fabricated description of what the tool does. */
  argHint?: string;
  agent: string;
  state: ObsToolCallState;
  duration?: string;
  nav?: ObsNavigation;
}

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
}
