/**
 * Pure presentation logic for the per-expert context-usage view (the Claude
 * `/context`-style segmented bar). No DOM, no Solid — just the proportion math,
 * the stable category ordering + color-class map, and the model-grounded
 * fullness fallback. Kept separate from {@link ContextUsageBar} so the math is
 * unit-testable in isolation.
 */
import type { ContextState, SemanticEventPayload } from '@clio/core';

/**
 * The /context-style category buckets, in the STABLE display order used by both
 * the segmented bar and the legend. `framing` (the synthetic
 * `used_tokens − live_tokens` bucket) sorts last so the model-grounded overhead
 * reads as a trailing band. Any category the backend ships that isn't in this
 * list is appended (alphabetically) after the known ones, before `framing`.
 */
export const CONTEXT_CATEGORY_ORDER = [
  'system',
  'messages',
  'tools',
  'tool_calls',
  'reasoning',
  'observations',
  'summary',
  'io',
  'other',
  'framing',
] as const;

export type ContextCategory = (typeof CONTEXT_CATEGORY_ORDER)[number] | string;

/** Human-facing label for a category key. */
export function categoryLabel(key: string): string {
  switch (key) {
    case 'tool_calls':
      return 'tool calls';
    case 'io':
      return 'I/O';
    default:
      return key.replace(/_/g, ' ');
  }
}

/**
 * Maps a category key to its stable CSS color class. The actual colors live in
 * `context-usage.css` as `--ctx-cat-*` design-token derivations, so the palette
 * tracks the theme/brand and is never hardcoded here. Unknown keys fall back to
 * the `other` swatch.
 */
export function categoryColorClass(key: string): string {
  const known = (CONTEXT_CATEGORY_ORDER as readonly string[]).includes(key)
    ? key
    : 'other';
  return `ctx-cat--${known}`;
}

/** One resolved block in the segmented bar / legend. */
export interface ContextSegmentBlock {
  key: string;
  label: string;
  colorClass: string;
  tokens: number;
  /** Fraction of the TOTAL attributed tokens (0..1) — legend %. */
  fraction: number;
  /** Width percent of the bar (0..100), summing to 100 across blocks. */
  widthPct: number;
}

/** Order index for a category key (unknown keys sort after known, before framing). */
function categoryRank(key: string): number {
  const idx = (CONTEXT_CATEGORY_ORDER as readonly string[]).indexOf(key);
  if (idx >= 0) return idx;
  // Unknown: place just before `framing` (which is last), preserving framing-last.
  return CONTEXT_CATEGORY_ORDER.length - 1.5;
}

/**
 * Resolve the `categories` map into ordered, proportional blocks. Zero/negative
 * buckets are dropped (the backend already drops zeros, but we defend). Widths
 * are normalized to sum to 100 across the surviving blocks; when the total is 0
 * the result is an empty list (caller renders an empty bar).
 */
export function contextSegments(
  categories: Record<string, number> | undefined,
): ContextSegmentBlock[] {
  const entries = Object.entries(categories ?? {}).filter(
    ([, v]) => typeof v === 'number' && v > 0,
  );
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (total <= 0) return [];
  return entries
    .sort((a, b) => {
      const r = categoryRank(a[0]) - categoryRank(b[0]);
      if (r !== 0) return r;
      // Stable tiebreak for two unknowns: alphabetical.
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    })
    .map(([key, tokens]) => ({
      key,
      label: categoryLabel(key),
      colorClass: categoryColorClass(key),
      tokens,
      fraction: tokens / total,
      widthPct: (tokens / total) * 100,
    }));
}

/**
 * Sum of the attributed category tokens (the segmented-bar total). This is the
 * absolute the legend percentages are taken against.
 */
export function categoryTotal(categories: Record<string, number> | undefined): number {
  return Object.values(categories ?? {}).reduce(
    (sum, v) => (typeof v === 'number' && v > 0 ? sum + v : sum),
    0,
  );
}

/**
 * Model-grounded fullness fraction in [0,1], or null when unknowable.
 *
 * Prefers `used_pct` (REAL last-LM-call prompt tokens / window). Falls back to
 * `pct_used` (segment-store live tokens / window) when `used_pct`/`used_tokens`
 * is null (i.e. between turns). Returns null when neither is available (e.g.
 * unknown window).
 */
export function fullnessFraction(state: Pick<
  ContextState,
  'used_pct' | 'pct_used' | 'used_tokens'
>): number | null {
  if (typeof state.used_pct === 'number' && state.used_tokens != null) {
    return clamp01(state.used_pct);
  }
  if (typeof state.pct_used === 'number') {
    return clamp01(state.pct_used);
  }
  return null;
}

/**
 * The absolute "used / window" tokens to headline. Prefers the real
 * `used_tokens`; falls back to the live attribution sum.
 */
export function usedTokensAbsolute(
  state: Pick<ContextState, 'used_tokens' | 'live_tokens'>,
): number {
  return state.used_tokens != null ? state.used_tokens : state.live_tokens;
}

/**
 * Position (0..100) of the auto-compaction threshold marker along the bar. The
 * bar is drawn over the category-total span, but the threshold is a fraction of
 * the WINDOW — so we map it onto the used/window fullness scale. When the bar
 * represents the attributed categories (which sum to ~used_tokens), the marker
 * sits at `autocompact_pct / fullness` of the bar width, clamped to [0,100].
 * Returns null when there's no threshold or no fullness reference.
 */
export function autocompactMarkerPct(
  state: Pick<
    ContextState,
    'autocompact_pct' | 'used_pct' | 'pct_used' | 'used_tokens'
  >,
): number | null {
  if (state.autocompact_pct == null || state.autocompact_pct <= 0) return null;
  const fullness = fullnessFraction(state);
  if (fullness == null || fullness <= 0) {
    // No fullness reference: the whole bar is the window, place the marker at
    // the raw threshold fraction.
    return clamp01(state.autocompact_pct) * 100;
  }
  // The bar spans `fullness` of the window; the threshold at `autocompact_pct`
  // of the window lands at autocompact_pct / fullness of the bar.
  return Math.min(100, Math.max(0, (state.autocompact_pct / fullness) * 100));
}

/**
 * Tone bucket for the fullness reading, mirroring the memory-health readout:
 * err ≥ 0.9, warn ≥ 0.75 (or ≥ the autocompact threshold), else ok; idle when
 * unknown.
 */
export type ContextTone = 'ok' | 'warn' | 'err' | 'idle';

export function contextTone(
  fraction: number | null,
  autocompactPct?: number | null,
): ContextTone {
  if (fraction == null) return 'idle';
  if (fraction >= 0.9) return 'err';
  const warnAt =
    typeof autocompactPct === 'number' && autocompactPct > 0
      ? Math.min(0.75, autocompactPct)
      : 0.75;
  if (fraction >= warnAt) return 'warn';
  return 'ok';
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Which denominator a legend/percentage is taken against:
 *  - `used`   — fraction of the ATTRIBUTED-used total (the segmented-bar sum);
 *               this is the composition breakdown and the widget default.
 *  - `window` — fraction of the full context WINDOW (capacity), so the numbers
 *               agree with the headline `used / window` fullness.
 * Surfacing both (behind a toggle) removes the two-denominators-in-one-widget
 * ambiguity: the bar's block WIDTHS are always of-used composition, while the
 * numbers can be read either way — each mode labelled so it's unambiguous.
 */
export type DenominatorMode = 'used' | 'window';

/**
 * Fraction (0..1) for one segment under the chosen denominator. `used` returns
 * the precomputed of-used composition fraction; `window` divides the segment's
 * tokens by the window capacity. Returns 0 when the window is unknown (caller
 * should gate the `window` mode off in that case rather than show misleading 0s).
 */
export function segmentFraction(
  block: Pick<ContextSegmentBlock, 'tokens' | 'fraction'>,
  mode: DenominatorMode,
  windowTokens: number,
): number {
  if (mode === 'window') {
    return windowTokens > 0 ? clamp01(block.tokens / windowTokens) : 0;
  }
  return block.fraction;
}

/** A live-active-agent reference resolved from the semantic-event stream. */
export interface ActiveAgentRef {
  /** Routing id/scope for the agent (the context scope to fetch). */
  id: string;
  /** Human title as reported by the backend (pre-brand-mapping). */
  title: string;
}

const REDACTION_SENTINEL = /^\[redacted\]:\d+ chars$/i;

/** Trimmed string value, or '' when absent or a redaction sentinel. */
function safeString(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return !text || REDACTION_SENTINEL.test(text) ? '' : text;
}

/** Resolve an agent reference from a semantic-event actor/subject dict. */
function agentRefFrom(record: Record<string, unknown> | undefined): ActiveAgentRef | null {
  if (!record) return null;
  const id = safeString(record['agent_id']);
  const title = safeString(record['agent_title']);
  if (!id && !title) return null;
  return { id: id || title, title: title || id };
}

/**
 * Resolve the executing expert from an `expert.lifecycle.started` event the way
 * the Go projector's `executionExpertID` does (execution_timeline_helpers.go):
 * the nested `payload.expert_id`, falling back to `actor.agent_id`. The human
 * title is taken best-effort from the same dicts; when absent it defaults to the
 * id (the caller's `presentBlueprintLabel(title, id)` re-derives a label). Null
 * when neither id source resolves.
 */
function expertRefFromEvent(event: SemanticEventPayload): ActiveAgentRef | null {
  const body = event.payload;
  const actor = event.actor;
  const id = safeString(body?.['expert_id']) || safeString(actor?.['agent_id']);
  if (!id) return null;
  const title =
    safeString(body?.['expert_title']) || safeString(actor?.['agent_title']) || id;
  return { id, title };
}

/** The agent a single event says is executing NOW, or null if the event is
 *  not an activity marker that pins an active agent. Only the events on the
 *  §7.6 served allow-list (execution_sse.go `semanticLedgerEventTypes`) can
 *  reach the client, so those are the only cases handled here. */
function activeAgentForEvent(event: SemanticEventPayload | undefined): ActiveAgentRef | null {
  if (!event) return null;
  switch (event.event_type) {
    // The most DIRECT signal an expert now owns execution: the Go projector's
    // applyExpertLifecycleStarted sets currentTextAgent from executionExpertID.
    case 'expert.lifecycle.started':
      return expertRefFromEvent(event);
    // Work was handed to the SUBJECT: it is now the executing agent. The
    // delegation atom rides BOTH prefixes depending on the runtime —
    // `blueprint.delegation.*` for Agent Blueprint experts, plain
    // `delegation.*` for expert-pack / prompt-agent delegations. Both are the
    // SAME atom (contract/SPEC.md §7.6) and track identically.
    case 'blueprint.delegation.started':
    case 'delegation.started':
      return agentRefFrom(event.subject) ?? agentRefFrom(event.actor);
    // The parent (ACTOR) picked the workflow back up.
    case 'blueprint.delegation.parent_resumed':
    case 'delegation.parent_resumed':
      return agentRefFrom(event.actor) ?? agentRefFrom(event.subject);
    default:
      return null;
  }
}

/**
 * Resolve the CURRENTLY-active agent from the semantic-event ledger: the agent
 * of the most recent activity marker (expert-lifecycle start or delegation
 * hand-off / parent-resume). Returns null when the stream has no attributable
 * activity (idle / between turns), so the caller falls back to the routing
 * root. This is a read of the observed trace, not a heuristic decision about
 * routing.
 */
export function activeAgentFromSemanticEvents(
  events: readonly SemanticEventPayload[] | undefined,
): ActiveAgentRef | null {
  if (!events || events.length === 0) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const ref = activeAgentForEvent(events[i]);
    if (ref) return ref;
  }
  return null;
}

/**
 * Whether an agent is a routable EXPERT (part of the tier-1→tier-N routing
 * hierarchy) — as opposed to a skill, tool, command, or other non-routable
 * catalog entry. Skills are agents with `source === 'skill'` (SPEC §6.5); other
 * non-expert kinds are detected from a `kind`/`role`/`is_skill` marker on the
 * agent or its metadata. Unknown/absent markers default to routable so a real
 * backend expert is never hidden.
 */
export function isRoutableExpert(agent: {
  source?: string;
  metadata?: Record<string, unknown>;
}): boolean {
  if (safeString(agent.source).toLowerCase() === 'skill') return false;
  const meta = agent.metadata ?? {};
  const topKind = (agent as { kind?: unknown }).kind;
  const kind = safeString(topKind ?? meta['kind'] ?? meta['agent_kind']).toLowerCase();
  const NON_EXPERT_KINDS = new Set(['skill', 'tool', 'command', 'hook', 'prompt']);
  if (kind && NON_EXPERT_KINDS.has(kind)) return false;
  if (safeString(meta['role']).toLowerCase() === 'skill') return false;
  if (meta['is_skill'] === true || meta['skill'] === true) return false;
  return true;
}
