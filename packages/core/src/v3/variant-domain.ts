import type { WireValue } from './domain.js';

/**
 * A BestOfN / Refine run (Phase 9): the agent drafting alternatives, or a
 * blueprint/subagent module run as variants. One run, keyed by its stable
 * `variants_id`, holds one try per `try_index` -- the tabs of its block.
 */
export type VariantOrigin = WireValue<'draft_alternatives' | 'module_variant'>;
export type VariantStrategy = WireValue<'best_of_n' | 'refine'>;
export type VariantJudge = WireValue<'lm' | 'user'>;
export type VariantTryState = WireValue<'running' | 'completed' | 'failed'>;
export type VariantRunStatus = WireValue<
  'running' | 'awaiting_pick' | 'answered' | 'selected' | 'failed'
>;

export interface VariantTryTokens {
  input: number;
  output: number;
  total: number;
}

/** A semantic event a try emitted live (its steps, tool calls), stamped with the try. */
export interface VariantTryActivity {
  event_type: string;
  summary: string;
  status: string;
  occurred_at?: string;
}

/** One part of a recorded try step (`clio.variant_run.v1`). */
export type VariantStepPart =
  | { type: 'text' | 'thinking'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | {
      type: 'tool_result';
      id: string;
      name: string;
      is_error: boolean;
      content: VariantStepPart[];
    }
  | { type: 'image' | 'document'; media_type: string }
  | { type: 'unknown'; original_type: string };

/** One message of a try's own recorded line: what it saw and did. */
export interface VariantTryStep {
  role: string;
  parts: VariantStepPart[];
}

/** One try of a variant run: its live stream while running, its result once ended. */
export interface VariantTry {
  /** `<variants_id>:<try_index>`, the try's entity id on the wire. */
  id: string;
  variants_id: string;
  try_index: number;
  /** The try's own scope, `<agent>#run<k>`; a user pick names it. */
  scope: string;
  state: VariantTryState;
  /** Streamed text while running; the final text once completed. */
  text: string;
  /** Streamed provider thinking. */
  thinking: string;
  /** The turn the try ran in (its user message id). */
  run_id?: string;
  /** The assistant message of that turn, when the server knows it. */
  anchor_message_id?: string;
  score?: number;
  tokens?: VariantTryTokens;
  error?: string;
  /** The try this one was forked from (Refine). */
  forked_from?: number;
  /** The advice this try was given (a Refine comment): harness data the try received. */
  advice?: string;
  /** Stamped semantic events seen live. */
  activity: VariantTryActivity[];
  /** The try's own recorded steps (served from clio-core after a reload). */
  steps: VariantTryStep[];
}

/** One judged try score in a selection. */
export interface VariantScore {
  try_index: number;
  score: number;
}

/** How the run ended: the judge's scores or the user's pick and comment. */
export interface VariantSelection {
  selected_index: number;
  selected_scope: string;
  text: string;
  scores: VariantScore[];
  winning_score?: number;
  /** The try index the user picked (judge `user`). */
  pick?: number;
  /** The user's comment on the pick (judge `user`). */
  comment?: string;
}

/** A finished draft offered for the user's pick (`metadata.variant.candidates`). */
export interface VariantCandidate {
  /** The draft id (`<agent>#run<k>`), what an answer's `selected_options` names. */
  id: string;
  try_index: number;
  text: string;
}

export interface VariantRun {
  variants_id: string;
  session_id: string;
  /** The turn the run started in (its user message id): where its block belongs. */
  run_id?: string;
  /** The assistant message of that turn, when the server knows it. */
  anchor_message_id?: string;
  agent_id: string;
  origin: VariantOrigin;
  strategy: VariantStrategy;
  judge: VariantJudge;
  /** How many tries the run makes at most. */
  n: number;
  /** The recorded run status (absent for a run known only from live frames). */
  status?: VariantRunStatus;
  rubric?: string;
  /** Tries in `try_index` order. */
  tries: VariantTry[];
  selection?: VariantSelection;
}
