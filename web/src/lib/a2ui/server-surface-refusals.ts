import {
  A2UI_SERVER_SURFACE_REFUSED_EVENT,
  decodeA2uiServerSurfaceRefusal,
  decodeEventEnvelope,
  type A2uiServerSurfaceRefusal,
  type TransportFrame,
} from '@clio/core/v3';
import { create } from 'zustand';

/**
 * Plugin views CLIO would not show (HS1), per conversation. The person did not
 * ask for them, so they are not toasts: the conversation shows each one as an
 * inline row where the view would have been, its reason under Technical
 * details. A frame replayed after a reconnect lands on the row it already has.
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
  if (frame.eventName !== A2UI_SERVER_SURFACE_REFUSED_EVENT) return;
  let envelope: ReturnType<typeof decodeEventEnvelope>;
  try {
    envelope = decodeEventEnvelope(frame.data);
  } catch {
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
