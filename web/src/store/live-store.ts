import {
  createEntityState,
  type EntityState,
  type StreamState,
  type TransportGap,
  type TransportFrame,
} from '@clio/core/v3';
import { create } from 'zustand';
import { reduceFramesContained } from '@/lib/streaming/frame-reduction';

/**
 * Stream gaps kept for diagnostics. Unit: gap records.
 * The store lives for the tab's lifetime, so this bound is what stops a long
 * flapping session from accumulating gap records forever. Raise it only if a
 * diagnosis needs deeper history than the last few reconnects.
 */
export const MAX_RETAINED_FRAME_GAPS = 100;

interface LiveStore {
  entities: EntityState;
  frameGaps: TransportGap[];
  error?: string;
  setStreamState: (stream: StreamState) => void;
  setStreamError: (error: string) => void;
  applyFrames: (frames: readonly TransportFrame[]) => void;
  replaceSnapshots: (snapshot: Partial<EntityState>) => void;
  mergeSnapshots: (snapshot: Partial<EntityState>) => void;
  reconcileSnapshots: (snapshot: Partial<EntityState>) => void;
  reset: () => void;
}

const ENTITY_MAP_KEYS = [
  'workspaces',
  'sessions',
  'runs',
  'messages',
  'tools',
  'approvals',
  'questions',
  'tasks',
  'subagents',
  'artifacts',
  'providers',
  'usage',
  'context',
  'surfaces',
  'infrastructure',
] as const satisfies readonly (keyof EntityState)[];

function isEntityMapKey(key: string): boolean {
  return (ENTITY_MAP_KEYS as readonly string[]).includes(key);
}

/**
 * Entity ids the live stream has written. The stream owns those rows until a
 * gap reconcile clears the revision watermark, so a REST snapshot taken before
 * them must not roll them back or drop them.
 *
 * The watermark is keyed by entity id alone (SPEC §7.8), so the keys ARE the
 * ids — no splitting. An earlier composite `type:id` key made this parse the
 * first colon back out, which mangled every id that legitimately contains one
 * (`sess_1:mcp:geo`).
 */
function streamOwnedIds(revisions: Record<string, number>): Set<string> {
  return new Set(Object.keys(revisions));
}

function mergeEntityMap(
  current: Record<string, unknown>,
  snapshot: Record<string, unknown>,
  streamOwned: ReadonlySet<string>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const [id, entity] of Object.entries(snapshot)) {
    merged[id] = streamOwned.has(id) && id in current ? current[id] : entity;
  }
  for (const [id, entity] of Object.entries(current)) {
    if (!(id in merged) && streamOwned.has(id)) merged[id] = entity;
  }
  return merged;
}

export const useLiveStore = create<LiveStore>((set) => ({
  entities: createEntityState(),
  frameGaps: [],
  setStreamState: (stream) => set((state) => ({ entities: { ...state.entities, stream } })),
  setStreamError: (error) =>
    set((state) => ({ entities: { ...state.entities, stream: 'gapped' }, error })),
  applyFrames: (frames) =>
    set((state) => {
      const { entities, gaps } = reduceFramesContained(state.entities, frames);
      return {
        entities,
        frameGaps: [...state.frameGaps, ...gaps].slice(-MAX_RETAINED_FRAME_GAPS),
        error: undefined,
      };
    }),
  replaceSnapshots: (snapshot) =>
    set((state) => ({ entities: { ...state.entities, ...snapshot }, error: undefined })),
  mergeSnapshots: (snapshot) =>
    set((state) => {
      const streamOwned = streamOwnedIds(state.entities.revisions);
      const entities: EntityState = { ...state.entities };
      for (const [key, value] of Object.entries(snapshot)) {
        if (isEntityMapKey(key) && value) {
          Reflect.set(
            entities,
            key,
            mergeEntityMap(
              (Reflect.get(state.entities, key) ?? {}) as Record<string, unknown>,
              value as Record<string, unknown>,
              streamOwned,
            ),
          );
        } else {
          Reflect.set(entities, key, value);
        }
      }
      return { entities, error: undefined };
    }),
  reconcileSnapshots: (snapshot) =>
    set((state) => ({
      entities: {
        ...state.entities,
        ...snapshot,
        cursor: undefined,
        processed_cursors: [],
      },
      error: undefined,
    })),
  reset: () => set({ entities: createEntityState(), frameGaps: [], error: undefined }),
}));
