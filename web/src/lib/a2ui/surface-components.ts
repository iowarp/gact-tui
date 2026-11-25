import type { A2UISurface } from '@clio/core/v3';

/** A surface's components by id, from its `updateComponents` messages. */
export function surfaceComponents(
  surface: A2UISurface | undefined,
): Map<string, Record<string, unknown>> {
  const components = new Map<string, Record<string, unknown>>();
  for (const envelope of surface?.messages ?? []) {
    if (!envelope || typeof envelope !== 'object') continue;
    const update = (envelope as Record<string, unknown>)['updateComponents'] as
      | { components?: unknown }
      | undefined;
    if (!Array.isArray(update?.components)) continue;
    for (const value of update.components) {
      if (!value || typeof value !== 'object') continue;
      const component = value as Record<string, unknown>;
      if (typeof component['id'] === 'string') components.set(component['id'], component);
    }
  }
  return components;
}

function literalText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  const literal =
    value && typeof value === 'object'
      ? (value as { literalString?: unknown }).literalString
      : undefined;
  return typeof literal === 'string' ? literal.trim() : '';
}

/**
 * The words the person read on the control that sent an action: a literal
 * `label`/`text` on it or on its `child`. A bound or missing label gives none.
 */
export function actionControlLabel(
  surface: A2UISurface | undefined,
  componentId: string | undefined,
): string {
  if (!componentId) return '';
  const components = surfaceComponents(surface);
  const own = components.get(componentId);
  if (!own) return '';
  const direct = literalText(own['label']) || literalText(own['text']);
  if (direct) return direct;
  const child = typeof own['child'] === 'string' ? components.get(own['child']) : undefined;
  return child ? literalText(child['text']) || literalText(child['label']) : '';
}
