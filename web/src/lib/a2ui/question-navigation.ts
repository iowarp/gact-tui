import type { A2UISurface, PendingInteraction } from '@clio/core/v3';
import { createContext } from 'react';

export interface SurfaceQuestionTarget {
  sessionId: string;
  surfaceId: string;
  answerAction: string;
  request: number;
}

/** Only an explicit producer choice embeds a surface inside a question. */
export function embedsQuestionSurface(interaction: PendingInteraction): boolean {
  return questionSurfaceMetadata(interaction)['a2ui_presentation'] === 'inline';
}

/** Read the server's open metadata without assuming its wire value is an object. */
export function questionSurfaceMetadata(interaction: PendingInteraction): Record<string, unknown> {
  const value = interaction.payload?.metadata;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const SurfaceQuestionTabs = createContext<
  { tabs: ReadonlyMap<string, string>; request: number } | undefined
>(undefined);

/** Find the tab ancestors of the named answer control, never from its label. */
export function questionTabPath(
  surface: A2UISurface,
  answerAction: string,
): ReadonlyMap<string, string> {
  const components = new Map<string, Record<string, unknown>>();
  for (const envelope of surface.messages) {
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
  const hasAnswer = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(hasAnswer);
    if (!value || typeof value !== 'object') return false;
    const row = value as Record<string, unknown>;
    const event = row['event'] as { name?: unknown } | undefined;
    return event?.name === answerAction || Object.values(row).some(hasAnswer);
  };
  const descendants = (value: unknown, key = ''): string[] => {
    if (typeof value === 'string')
      return ['child', 'children', 'explicitList', 'content', 'trigger'].includes(key) &&
        components.has(value)
        ? [value]
        : [];
    if (Array.isArray(value)) return value.flatMap((item) => descendants(item, key));
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([name, child]) => descendants(child, name));
  };
  const containsAnswer = (id: string, seen = new Set<string>()): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    const component = components.get(id);
    return Boolean(
      component &&
        (hasAnswer(component) ||
          descendants(component).some((child) => containsAnswer(child, seen))),
    );
  };
  const path = new Map<string, string>();
  for (const [id, component] of components) {
    if (component['component'] !== 'Tabs' || !Array.isArray(component['tabs'])) continue;
    const matches = component['tabs'].filter(
      (tab: { child?: unknown } | null) =>
        tab && typeof tab.child === 'string' && containsAnswer(tab.child),
    );
    // An ambiguous action must not silently open the wrong decision.
    if (matches.length === 1) path.set(id, matches[0].child as string);
  }
  return path;
}
