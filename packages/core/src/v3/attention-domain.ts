/**
 * Attention attribution for one selected span of a rendered agent answer
 * ("Understand attention"): which earlier transcript text the model actually
 * drew on to produce that span, broken down by domain (system prompt, the
 * user's own messages, tool definitions, tool calls, tool results, the
 * model's own reasoning, earlier answers) and by exact character run inside
 * each contributing message part.
 *
 * Mirrors clio-agent `POST /v1/sessions/{sid}/messages/{mid}/attention` and
 * `GET .../attention/availability` (branch `feat/attention-view`, #1490). Both
 * endpoints always answer 200; unavailability is a typed payload
 * (`AttentionUnavailable`), never an HTTP error, so a bad selection or a
 * model without attention support degrades to a message, not a failure.
 */

/** A [char_lo, char_hi, value) heat run, offsets into one part's source text. */
import type { AttentionProfile } from '../generated/clio-schemas/attention_profile.js';
export type { AttentionProfile } from '../generated/clio-schemas/attention_profile.js';

export type AttentionRun = readonly [charLo: number, charHi: number, value: number];

/** The domains attention can be attributed to. */
export type AttentionDomain =
  | 'system'
  | 'user'
  | 'tool_definitions'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'assistant_output'
  | 'other'
  | 'template';

/** Which transcript field a block's `runs` are offsets into. */
export type AttentionBlockKind =
  | 'user_text'
  | 'assistant_text'
  | 'thought'
  | 'tool_input'
  | 'tool_result';

export interface AttentionSelection {
  part_id?: string;
  field?: string;
  start?: number;
  end?: number;
  text: string;
  token_range?: readonly [number, number];
  steps?: readonly number[];
  step_count?: number;
  output_tokens?: number;
}

export interface AttentionSource {
  domain: AttentionDomain;
  share: number;
}

export interface AttentionFlag {
  kind: string;
  share: number;
}

/** One contributing transcript text (one message part's one field) and its heat runs. */
export interface AttentionBlock {
  message_id: string;
  part_id: string;
  call_id?: string;
  content_revision?: string;
  field: string;
  kind: AttentionBlockKind;
  section?: number;
  share: number;
  mean: number;
  tokens?: number;
  runs: readonly AttentionRun[];
  display_runs?: readonly AttentionRun[];
  score?: number;
  intensity?: number;
  retained_tokens?: number;
}

export interface AttentionTokenSource {
  pos: number;
  max: number;
  mean: number;
  section?: number;
  text: string;
}

export interface AttentionToken {
  step: number;
  token_index: number;
  text: string;
  residual: number;
  top: readonly AttentionTokenSource[];
}

export interface AttentionAvailable {
  schema?: string;
  available: true;
  message_id: string;
  profile?: AttentionProfile;
  profile_revision?: string;
  display_semantics?: {
    metric: string;
    block_scale: number;
    token_scale: number;
    scope: string;
    missing: string;
  };
  selection: AttentionSelection;
  /**
   * Fraction of attention spread across the conversation's other prompt
   * positions: the ones below the connector's top-10%-per-segment capture
   * cut, thinly distributed rather than concentrated. Not "unknown" or
   * "unattributed" mass — it is real attention, just too diffuse per-position
   * to retain individually. Always shown, never hidden.
   */
  residual: number;
  sources: readonly AttentionSource[];
  flags: readonly AttentionFlag[];
  blocks: readonly AttentionBlock[];
  tokens?: readonly AttentionToken[];
}

export interface AttentionUnavailable {
  available: false;
  reason?: string;
  /** Written for display; show this verbatim, never a synthesized substitute. */
  message: string;
  detail?: string;
  context?: Record<string, unknown>;
}

export type AttentionResult = AttentionAvailable | AttentionUnavailable;

/**
 * `GET /v1/sessions/{sid}/attention/availability`: whether this session can
 * show attention at all (`enabled`, with the typed `reason`/`message` when not),
 * and which assistant answers have it (`messages[id]`).
 */
export interface AttentionSessionAvailability {
  enabled: boolean;
  reason?: string;
  message?: string;
  detail?: string;
  messages: Record<string, boolean>;
}

export const ATTENTION_DOMAIN_LABELS: Record<AttentionDomain, string> = {
  system: 'System prompt',
  user: 'Your messages',
  tool_definitions: 'Tool definitions',
  tool_call: 'Tool calls',
  tool_result: 'Tool results',
  thinking: 'Agent reasoning',
  assistant_output: 'Earlier answers',
  other: 'Other',
  template: 'Formatting',
};

export function attentionDomainLabel(domain: string): string {
  return ATTENTION_DOMAIN_LABELS[domain as AttentionDomain] ?? domain;
}
