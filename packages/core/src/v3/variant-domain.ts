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

export interface VariantTryTokens {
  input: number;
  output: number;
  total: number;
}

/** A semantic event a try emitted (its steps, tool calls, lifecycle), stamped with the try. */
export interface VariantTryActivity {
  event_type: string;
  summary: string;
  status: string;
  occurred_at?: string;
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
  /** Run id (turn) the try ran in. */
  run_id?: string;
  score?: number;
  tokens?: VariantTryTokens;
  error?: string;
  /** The try this one was forked from (Refine). */
  forked_from?: number;
  /** The advice this try was given (a Refine comment): harness data the try received. */
  advice?: string;
  activity: VariantTryActivity[];
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

/** A finished draft offered for the user's pick. */
export interface VariantCandidate {
  /** The draft id (`<agent>#run<k>`), what an answer's `selected_options` names. */
  id: string;
  try_index: number;
  text: string;
}

/** A pick question the run asked the user (judge `user`), from `question.upserted`. */
export interface VariantQuestion {
  id: string;
  session_id: string;
  status: WireValue<'pending' | 'answered' | 'cancelled' | 'expired'>;
  prompt: string;
  rubric?: string;
  /** A comment refines the pick into another try instead of accepting it. */
  refinable: boolean;
  candidates: VariantCandidate[];
  selected_options: string[];
  answer?: string;
  created_at: string;
}

export interface VariantRun {
  variants_id: string;
  session_id: string;
  /** The run id (turn) the run started in: where its block belongs in the conversation. */
  run_id?: string;
  agent_id: string;
  origin: VariantOrigin;
  strategy: VariantStrategy;
  judge: VariantJudge;
  /** How many tries the run makes at most. */
  n: number;
  /** Tries in `try_index` order. */
  tries: VariantTry[];
  selection?: VariantSelection;
  /** Pick questions in the order they were asked; the last one is current. */
  questions: VariantQuestion[];
}
