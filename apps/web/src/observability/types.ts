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
}

export interface ObservabilityData {
  agents: ObsAgent[];
  runs: ObsRun[];
  /** Tools each expert can reach, keyed by expert id. */
  toolsByExpert: Record<string, ObsTool[]>;
  artifacts: ObsArtifact[];
  context?: ObsContext;
}
