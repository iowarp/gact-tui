import {
  createEntityState,
  reduceTransportFrame,
  type EntityState,
  type StreamState,
  type TransportFrame,
} from '@clio/core/v3';
import { create } from 'zustand';

interface LiveStore {
  entities: EntityState;
  error?: string;
  setStreamState: (stream: StreamState) => void;
  setStreamError: (error: string) => void;
  applyFrames: (frames: readonly TransportFrame[]) => void;
  replaceSnapshots: (snapshot: Partial<EntityState>) => void;
  reconcileSnapshots: (snapshot: Partial<EntityState>) => void;
  reset: () => void;
}

export const useLiveStore = create<LiveStore>((set) => ({
  entities: createEntityState(),
  setStreamState: (stream) => set((state) => ({ entities: { ...state.entities, stream } })),
  setStreamError: (error) =>
    set((state) => ({ entities: { ...state.entities, stream: 'gapped' }, error })),
  applyFrames: (frames) =>
    set((state) => {
      try {
        return {
          entities: frames.reduce(reduceTransportFrame, state.entities),
          error: undefined,
        };
      } catch (error) {
        return {
          entities: { ...state.entities, stream: 'gapped' },
          error: error instanceof Error ? error.message : 'Unable to decode the live stream',
        };
      }
    }),
  replaceSnapshots: (snapshot) =>
    set((state) => ({ entities: { ...state.entities, ...snapshot }, error: undefined })),
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
  reset: () => set({ entities: createEntityState(), error: undefined }),
}));
