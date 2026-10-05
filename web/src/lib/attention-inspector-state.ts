import { attentionProfileSchema, contentSelectionSchema } from '@clio/core/v3';
import { z } from 'zod';

const stateSchema = z.object({
  items: z
    .array(z.object({ reference: contentSelectionSchema, label: z.string().max(120) }))
    .max(32),
  direction: z.enum(['generated_to_source', 'source_to_generation']),
  profile: attentionProfileSchema.optional(),
});
export type AttentionInspectorState = z.infer<typeof stateSchema>;

/** Tab-local references survive navigation; capture bytes/results are never cached here. */
export function readAttentionInspector(key: string): AttentionInspectorState {
  try {
    const value = stateSchema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? 'null'));
    if (value.success) return value.data;
  } catch {
    // Storage can be disabled or contain an older schema; start an empty basket.
  }
  return { items: [], direction: 'generated_to_source' };
}

export function saveAttentionInspector(key: string, state: AttentionInspectorState): void {
  try {
    if (state.items.length) sessionStorage.setItem(key, JSON.stringify(state));
    else sessionStorage.removeItem(key);
  } catch {
    // The current mounted inspector still works when browser storage is unavailable.
  }
}
