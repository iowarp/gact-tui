/**
 * A session's live cumulative token/cost rollup (status-bar truth). The
 * single producer is the reducer: seeded from the session snapshot's own
 * `tokens_input`/`tokens_output`/`cost_usd` and kept live by adding each
 * `message.completed` event's per-turn numbers. `cost_usd` is absent when no
 * turn has ever reported a real cost -- distinct from a provider-confirmed
 * $0 turn -- so a consumer renders "unknown", never a fabricated zero.
 */
export interface UsageSnapshot {
  session_id: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd?: number;
}
