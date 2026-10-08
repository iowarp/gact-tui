import {
  EFFECTIVE_CONTEXT_CHOICE_KEY,
  EFFECTIVE_CONTEXT_LENGTH_KEY,
  EFFECTIVE_CONTEXT_REASON_KEY,
  type ContextChoice,
  type ContextControls,
  type ContextSizingSpec,
} from '@clio/core/v3';

/**
 * What the person has chosen in a context control. An empty `choice` keeps
 * CLIO's default (for a deployment: Fit to GPU when it can be computed).
 */
export interface ContextDraft {
  choice: ContextChoice | '';
  tokens: string;
  strategy: string;
}

export interface ContextBounds {
  minimum: number;
  maximum?: number;
}

/** The context in force after a deploy or save, and why. */
export interface EffectiveContext {
  length?: number;
  reason: string;
  choice?: string;
}

export const EMPTY_CONTEXT_DRAFT: ContextDraft = { choice: '', tokens: '', strategy: '' };

export function formatTokens(value: number): string {
  return value.toLocaleString('en-US');
}

/** Why a typed context cannot be used, or undefined when it can. */
export function contextDraftError(draft: ContextDraft, bounds: ContextBounds): string | undefined {
  if (draft.choice !== 'number') return undefined;
  const typed = draft.tokens.trim();
  if (!typed) return 'Type a context length, or choose Max.';
  if (!/^\d+$/u.test(typed)) return 'Type a whole number of tokens.';
  const tokens = Number(typed);
  if (tokens < bounds.minimum) return `At least ${formatTokens(bounds.minimum)} tokens.`;
  if (bounds.maximum !== undefined && tokens > bounds.maximum) {
    return `At most ${formatTokens(bounds.maximum)} tokens, this model’s maximum.`;
  }
  return undefined;
}

/** The control's state from a deployment configuration (`param.<id>` + `context.*`). */
export function deploymentContextDraft(
  configuration: Record<string, string>,
  spec: ContextSizingSpec,
  parameterKey: string,
): ContextDraft {
  const typed = configuration[parameterKey]?.trim() ?? '';
  const stored = configuration[spec.choice_key]?.trim() ?? '';
  const choice: ContextDraft['choice'] =
    stored === 'number' || stored === 'max' || stored === 'fit_to_gpu'
      ? stored
      : typed
        ? 'number'
        : '';
  return {
    choice,
    tokens: choice === 'number' ? typed : '',
    strategy: choice === 'fit_to_gpu' ? (configuration[spec.strategy_key] ?? '') : '',
  };
}

/** The deployment configuration entries that carry `draft`. */
export function deploymentContextEntries(
  draft: ContextDraft,
  spec: ContextSizingSpec,
  parameterKey: string,
): Record<string, string> {
  return {
    [parameterKey]: draft.choice === 'number' ? draft.tokens : '',
    [spec.choice_key]: draft.choice,
    [spec.strategy_key]: draft.choice === 'fit_to_gpu' ? draft.strategy : '',
  };
}

/** The settled context of an installed deployment, from its configuration. */
export function deploymentEffectiveContext(
  configuration: Record<string, string>,
): EffectiveContext | undefined {
  const raw = configuration[EFFECTIVE_CONTEXT_LENGTH_KEY]?.trim() ?? '';
  const reason = configuration[EFFECTIVE_CONTEXT_REASON_KEY]?.trim() ?? '';
  if (!raw && !reason) return undefined;
  const length = /^\d+$/u.test(raw) ? Number(raw) : undefined;
  return { length, reason, choice: configuration[EFFECTIVE_CONTEXT_CHOICE_KEY] || undefined };
}

/** The control's state from a model's saved working context. */
export function modelContextDraft(controls: ContextControls): ContextDraft {
  return controls.current_choice === 'number' && controls.current
    ? { choice: 'number', tokens: String(controls.current), strategy: '' }
    : { choice: 'max', tokens: '', strategy: '' };
}

/** A model's working context as the service reports it. */
export function modelEffectiveContext(controls: ContextControls): EffectiveContext | undefined {
  if (!controls.current && !controls.current_reason) return undefined;
  return {
    length: controls.current,
    reason: controls.current_reason,
    choice: controls.current_choice,
  };
}
