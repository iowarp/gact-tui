import {
  A2UI_SERVER_SURFACE_REFUSED_EVENT,
  decodeA2uiServerSurfaceRefusal,
  decodeEventEnvelope,
  decodePluginPageEvent,
  decodePluginTabEvent,
  type A2uiServerSurfaceRefusal,
  type TransportFrame,
} from '@clio/core/v3';
import { create } from 'zustand';

/**
 * Plugin views CLIO would not show (HS1), per conversation. The person did not
 * ask for them, so they are not toasts: the conversation shows each one as an
 * inline row where the view would have been, its reason under Technical
 * details. A frame replayed after a reconnect lands on the row it already has.
 * A later surface from the same plugin (a read that worked) clears its rows, and
 * a replay delivers that surface after the old refusal, so the refusal clears again.
 */
export interface ServerSurfaceRefusal extends A2uiServerSurfaceRefusal {
  id: string;
}

/** A conversation keeps its latest few; an older refusal adds nothing new. */
const KEEP = 5;

const EMPTY: readonly ServerSurfaceRefusal[] = [];

const useRefusalStore = create<{ bySession: Record<string, readonly ServerSurfaceRefusal[]> }>(
  () => ({ bySession: {} }),
);

export function useServerSurfaceRefusals(
  sessionId: string | undefined,
): readonly ServerSurfaceRefusal[] {
  return useRefusalStore((store) => (sessionId ? store.bySession[sessionId] : undefined) ?? EMPTY);
}

/** Records the refusal a live frame reports, if it reports one. */
export function dispatchServerSurfaceRefusalFrame(frame: TransportFrame, sessionId: string): void {
  const name = frame.eventName ?? '';
  const surfaceEvent = name.startsWith('plugin_tab.') || name.startsWith('plugin_page.');
  if (name !== A2UI_SERVER_SURFACE_REFUSED_EVENT && !surfaceEvent) return;
  let envelope: ReturnType<typeof decodeEventEnvelope>;
  try {
    envelope = decodeEventEnvelope(frame.data);
  } catch {
    return;
  }
  if (surfaceEvent) {
    const event =
      decodePluginTabEvent(name, envelope.payload) ?? decodePluginPageEvent(name, envelope.payload);
    if (event?.type === 'plugin_tab.surface.upserted') {
      const owner = event.surface.owner;
      supersede(sessionId, (row) =>
        owner
          ? row.plugin === owner.plugin && row.server === owner.server
          : row.plugin === pluginOf(event.tab_id),
      );
    } else if (event?.type === 'plugin_tab.refreshed' && event.surface_ids.length > 0) {
      supersede(sessionId, (row) => row.plugin === pluginOf(event.tab_id));
    }
    return;
  }
  const refusal = decodeA2uiServerSurfaceRefusal(envelope.payload);
  if (!refusal) return;
  const entity = (frame.data as { entity_id?: unknown }).entity_id;
  const id = typeof entity === 'string' && entity !== '' ? entity : frame.cursor;
  useRefusalStore.setState((store) => {
    const current = store.bySession[sessionId] ?? EMPTY;
    if (current.some((row) => row.id === id)) return store;
    return {
      bySession: { ...store.bySession, [sessionId]: [...current, { ...refusal, id }].slice(-KEEP) },
    };
  });
}

/** A tab or page id is `<plugin>/<id>`. */
function pluginOf(id: string): string {
  return id.split('/')[0] ?? id;
}

function supersede(sessionId: string, matches: (row: ServerSurfaceRefusal) => boolean): void {
  useRefusalStore.setState((store) => {
    const current = store.bySession[sessionId];
    if (!current?.some(matches)) return store;
    return {
      bySession: { ...store.bySession, [sessionId]: current.filter((row) => !matches(row)) },
    };
  });
}
