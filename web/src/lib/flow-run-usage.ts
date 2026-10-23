import type { FlowRunUsage } from '@clio/core/v3';

/** Why a child runs on its model, by `model_choice.source`. */
export const MODEL_CHOICE_SOURCE: Record<string, string> = {
  explicit: `named for this call`,
  prefers: 'its preference',
  inherited: 'the caller’s model',
  person: 'chosen by you',
};

export function shortModel(ref: string): string {
  return ref.split('/').slice(1).join('/') || ref;
}

/** The model a call's child runs on and why, for its details. */
export function callModel(usage: FlowRunUsage | undefined, handle: string | undefined) {
  const row = handle ? usage?.calls[handle] : undefined;
  if (!row?.model) return undefined;
  const source = row.choice?.source ?? '';
  const why = MODEL_CHOICE_SOURCE[source] ?? source;
  return `${shortModel(row.model)}${why ? ` (${why})` : ''}`;
}
