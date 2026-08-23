/** Service-owned retention statistics for one session. */
export interface SessionMemoryStatistics {
  session_id: string;
  messages_retained: number;
  tokens_retained: number;
  tokens_budget?: number;
  profiles_attached: number;
  context_files_attached: number;
  context_files_by_mode: Record<string, number>;
  compact_summaries: number;
  token_pressure: number;
  threshold_state: 'empty' | 'normal' | 'warning' | 'critical';
  compaction_recommended: boolean;
}

/** Connection and optional per-session retention statistics. */
export interface MemoryStatistics {
  cache: { hits: number; misses: number; hit_rate: number; capacity: number };
  session?: SessionMemoryStatistics;
  global: { conversations_total: number; invocations_total: number };
  metadata: Record<string, unknown>;
}

/** A server-owned record of transcript compaction and its retained summary. */
export interface MemoryEvent {
  id: string;
  version: number;
  type: 'compact_summary';
  session_id: string;
  created_at: string;
  updated_at: string;
  summary_message_id: string;
  archived_count: number;
  summary_chars: number;
  transcript_chars: number;
  focus: string;
  arc_status: string;
  metadata: Record<string, unknown>;
}
