export interface HealthIntegration {
  name: string;
  status: 'ready' | 'degraded' | 'unavailable' | 'skipped' | string;
  detail?: string;
}

export interface HealthSnapshot {
  healthy: boolean;
  uptime_s: number;
  overall_status?: string;
  integrations?: HealthIntegration[];
}

/**
 * Coarse session-context pressure signal (SPEC §6.19 drift note). clio reports
 * `threshold_state` as the human-facing budget pressure bucket; older / generic
 * backends may omit it (then `token_pressure` / the retained-vs-budget ratio is
 * the fallback). Unknown strings render as a neutral row.
 */
export type MemoryThresholdState =
  | 'empty'
  | 'normal'
  | 'warning'
  | 'critical'
  | string;

/**
 * Per-session memory block returned by GET /v1/memory/stats?session_id=…
 * (present only when a session id is supplied). Typed from SPEC §6.19 — the
 * web previously left this `unknown`, so the token-pressure / budget signals
 * the TUI surfaces were unreachable.
 */
export interface SessionMemoryStats {
  session_id?: string;
  messages_retained?: number;
  tokens_retained?: number;
  /** null when the backend imposes no context-window budget. */
  tokens_budget?: number | null;
  profiles_attached?: number;
  context_files_attached?: number;
  compact_summaries?: number;
  /** [0..1] fraction of the budget currently consumed (clio drift field). */
  token_pressure?: number;
  threshold_state?: MemoryThresholdState;
  compaction_recommended?: boolean;
  [k: string]: unknown;
}

export interface MemoryStats {
  cache: {
    hits: number;
    misses: number;
    hit_rate: number;
    capacity: number;
  };
  session?: SessionMemoryStats;
  global?: {
    conversations_total: number;
    invocations_total: number;
  };
  metadata?: Record<string, unknown>;
}

export interface MetricsSnapshot {
  uptime_s: number;
  sessions?: {
    total: number;
    active: number;
    by_status?: Record<string, number>;
  };
  messages?: {
    total: number;
    by_role?: Record<string, number>;
  };
  tokens?: {
    input_total: number;
    output_total: number;
    cache_read_total?: number;
    cache_write_total?: number;
  };
  cost?: {
    total_usd: number;
    by_provider?: Record<string, number>;
  };
  latencies?: Record<string, unknown>;
}
