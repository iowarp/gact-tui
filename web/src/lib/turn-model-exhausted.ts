export type ModelExhausted = {
  model: string;
  resetsAt: string;
  alternatives: string[];
};

/**
 * The `model_exhausted` record of a failed turn whose model the person chose
 * (`details.model_exhausted`, `chooser: person`), or `undefined`.
 */
export function turnModelExhausted(
  errorInfo: Record<string, unknown> | undefined,
): ModelExhausted | undefined {
  const details = errorInfo?.details;
  if (!details || typeof details !== 'object') return undefined;
  const record = (details as Record<string, unknown>).model_exhausted;
  if (!record || typeof record !== 'object') return undefined;
  const row = record as Record<string, unknown>;
  if (row.chooser !== 'person') return undefined;
  return {
    model: typeof row.model === 'string' ? row.model : '',
    resetsAt: typeof row.resets_at === 'string' ? row.resets_at : '',
    alternatives: Array.isArray(row.alternatives)
      ? row.alternatives.filter((ref): ref is string => typeof ref === 'string')
      : [],
  };
}
