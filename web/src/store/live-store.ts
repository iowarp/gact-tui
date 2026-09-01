import {
  createEntityState,
  type EntityState,
  type StreamState,
  type TransportGap,
  type TransportFrame,
} from '@clio/core/v3';
import { create } from 'zustand';
import { reduceFramesContained } from '@/lib/streaming/frame-reduction';

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
 */
function streamOwnedIds(revisions: Record<string, number>): Set<string> {
  const owned = new Set<string>();
  for (const key of Object.keys(revisions)) {
    const separator = key.indexOf(':');
    if (separator > 0) owned.add(key.slice(separator + 1));
  }
  return owned;
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
        frameGaps: [...state.frameGaps, ...gaps].slice(-100),
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
