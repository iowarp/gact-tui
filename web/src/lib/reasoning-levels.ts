import { REASONING_EFFORTS, type ReasoningEffort } from '@clio/core/v3';

/** The thinking levels one model offers, as the provider catalog reports them. */
export interface ModelReasoningLevels {
  /** Levels a person can choose, ascending. Empty means there is nothing to choose. */
  levels: ReasoningEffort[];
  /** The model's own level when its provider names one. */
  default?: ReasoningEffort;
}

/** The effort as a contract value, or nothing when this build has no setting for it. */
export function knownReasoningEffort(value?: string | null): ReasoningEffort | undefined {
  return REASONING_EFFORTS.find((effort) => effort === value);
}

/**
 * Narrow a catalog model's reported reasoning block to levels the message
 * contract can carry. A level this build does not know is not offered — it
 * could not be sent — rather than being mapped onto a neighbour.
 */
export function modelReasoningLevels(
  reasoning: { levels: readonly string[]; default?: string } | undefined,
): ModelReasoningLevels | undefined {
  if (!reasoning) return undefined;
  const levels = REASONING_EFFORTS.filter((effort) => reasoning.levels.includes(effort));
  const fallback = knownReasoningEffort(reasoning.default);
  return { levels, default: fallback && levels.includes(fallback) ? fallback : undefined };
}

/**
 * The effort a message sends: the person's choice when the model offers it,
 * else the model's own default, else nothing (the configured level governs).
 */
export function effectiveReasoningEffort(
  chosen: ReasoningEffort | undefined,
  reasoning: ModelReasoningLevels | undefined,
): ReasoningEffort | undefined {
  if (!reasoning?.levels.length) return undefined;
  if (chosen && reasoning.levels.includes(chosen)) return chosen;
  return reasoning.default;
}

/** Product names for every level the message contract defines. */
export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};
