import { REASONING_EFFORTS, type ReasoningEffort } from '@clio/core/v3';

/** The thinking levels one model offers, as the provider catalog reports them. */
export interface ModelReasoningLevels {
  /** Levels a person can choose, ascending. Empty means there is nothing to choose. */
  levels: ReasoningEffort[];
  /** The default level when one is named. */
  default?: ReasoningEffort;
  /** True when `default` is CLIO's shipped level, not the model's own. */
  defaultIsShipped?: boolean;
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
  reasoning: { levels: readonly string[]; default?: string; default_source?: string } | undefined,
): ModelReasoningLevels | undefined {
  if (!reasoning) return undefined;
  const levels = REASONING_EFFORTS.filter((effort) => reasoning.levels.includes(effort));
  const fallback = knownReasoningEffort(reasoning.default);
  const known = fallback && levels.includes(fallback) ? fallback : undefined;
  return {
    levels,
    default: known,
    defaultIsShipped: Boolean(known) && reasoning.default_source === 'clio_shipped',
  };
}

/**
 * The label of an unpicked control's default: "Model default (X)" only for the
 * model's own default; CLIO's shipped level reads "Default (X)".
 */
export function modelDefaultLabel(reasoning: ModelReasoningLevels | undefined): string {
  if (!reasoning?.default) return 'Model default';
  const name = REASONING_EFFORT_LABELS[reasoning.default];
  return reasoning.defaultIsShipped ? `Default (${name})` : `Model default (${name})`;
}

/**
 * The effort a message sends: the person's own pick when the selected model
 * offers it, else nothing -- the service then applies the configured level (or
 * the model's default). A default is shown, never sent.
 */
export function effectiveReasoningEffort(
  chosen: ReasoningEffort | undefined,
  reasoning: ModelReasoningLevels | undefined,
): ReasoningEffort | undefined {
  if (!chosen || !reasoning?.levels.includes(chosen)) return undefined;
  return chosen;
}

/**
 * What an unpicked reasoning control displays: the configured level when the
 * model offers it, else the model's own default.
 */
export function defaultReasoningLabel(
  configured: string | undefined,
  reasoning: ModelReasoningLevels | undefined,
): string {
  const level = knownReasoningEffort(configured);
  if (level && reasoning?.levels.includes(level)) {
    return `Default (${REASONING_EFFORT_LABELS[level]})`;
  }
  return modelDefaultLabel(reasoning);
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
  ultra: 'Ultra',
};
