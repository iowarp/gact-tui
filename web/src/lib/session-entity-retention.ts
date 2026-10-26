import type { EntityState } from '@clio/core/v3';

const SESSION_MAPS = [
  'messages',
  'tools',
  'runs',
  'tasks',
  'subagents',
  'artifacts',
  'context',
  'surfaces',
  'usage',
  'variant_runs',
  'a2ui_action_lifecycles',
] as const;

/** Drop expired session bodies while preserving navigation metadata and live cross-references. */
export function withoutSessionData(entities: EntityState, sessionId: string): EntityState {
  const referenced = new Set<string>();
  for (const message of Object.values(entities.messages)) {
    if (message.session_id === sessionId) continue;
    for (const block of message.blocks)
      for (const [key, value] of Object.entries(block)) {
        if (key.endsWith('_id') && typeof value === 'string') referenced.add(value);
      }
  }
  const next = { ...entities };
  const removed = new Set<string>();
  for (const map of SESSION_MAPS) {
    const rows = Reflect.get(entities, map) as Record<string, unknown> | undefined;
    if (!rows) continue;
    const kept = Object.fromEntries(
      Object.entries(rows).filter(([id, value]) => {
        if (
          value &&
          typeof value === 'object' &&
          'session_id' in value &&
          value.session_id === sessionId &&
          !referenced.has(id)
        ) {
          removed.add(id);
          return false;
        }
        return true;
      }),
    );
    Reflect.set(next, map, kept);
  }
  next.revisions = Object.fromEntries(
    Object.entries(entities.revisions).filter(([id]) => !removed.has(id)),
  );
  return next;
}
