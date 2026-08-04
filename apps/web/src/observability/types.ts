export type AgentStatus = 'running' | 'done' | 'failed' | 'queued';

export interface ObsAgent {
  id: string;
  label: string;
  status: AgentStatus;
  /** Nesting depth in the spawn tree; 0 is the main agent. */
  depth: number;
  duration?: string;
}

export interface ObsRun {
  id: string;
  agent: string;
  state: string;
  label?: string;
  host?: string;
  duration?: string;
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

export type ObsTimelineKind = 'event' | 'tool' | 'artifact' | 'failure' | 'running';

export interface ObsTimelineRow {
  at?: string;
  actor: string;
  action: string;
  duration?: string;
  kind: ObsTimelineKind;
  depth?: number;
  /** Stable backend identity used to discard SSE reconnect replays. */
  sourceId?: string;
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
}

export interface ObsArtifactRow {
  at?: string;
  name: string;
  producer: string;
  meta: string;
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
}
