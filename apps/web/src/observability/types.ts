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
  actor: string;
  action: string;
  duration?: string;
  kind: ObsTimelineKind;
  depth?: number;
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
  tool?: boolean;
  nav?: ObsNavigation;
}

export interface ObsArtifactRow {
  at?: string;
  name: string;
  producer: string;
  meta: string;
}

export type ObsToolCallState = 'done' | 'running' | 'failed';

/** One row of the tools tab's chronological call log — the prototype's
 *  `obsToolRows` (design/prototype/Clio Session.html ~8256494): a real call
 *  made this session, not a static per-server catalog entry. */
export interface ObsToolCallRow {
  sourceId: string;
  at?: string;
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
}
