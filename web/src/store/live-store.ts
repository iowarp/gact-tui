import {
  createEntityState,
  eventEnvelopeSchema,
  reduceTransportFrame,
  type EntityState,
  type StreamState,
  type TransportGap,
  type TransportFrame,
} from '@clio/core/v3';
import { create } from 'zustand';

interface LiveStore {
  entities: EntityState;
  frameGaps: TransportGap[];
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
  frameGaps: [],
  setStreamState: (stream) => set((state) => ({ entities: { ...state.entities, stream } })),
  setStreamError: (error) =>
    set((state) => ({ entities: { ...state.entities, stream: 'gapped' }, error })),
  applyFrames: (frames) =>
    set((state) => {
      let entities = state.entities;
      const frameGaps = [...state.frameGaps];

      for (const frame of frames) {
        const decoded = eventEnvelopeSchema.safeParse(frame.data);
        if (!decoded.success) {
          frameGaps.push({
            cursor: frame.cursor,
            event_name: frame.eventName,
            code: 'frame_decode_failed',
            reason: decoded.error.issues[0]?.message ?? 'Unable to decode live frame',
            received_at: frame.receivedAt,
          });
          continue;
        }

        if (decoded.data.type !== frame.eventName) {
          frameGaps.push({
            cursor: frame.cursor,
            event_name: frame.eventName,
            entity_id: decoded.data.entity_id,
            code: 'event_name_mismatch',
            reason: `Stream named ${frame.eventName}; envelope named ${decoded.data.type}`,
            received_at: frame.receivedAt,
          });
        }

        try {
          entities = reduceTransportFrame(entities, frame);
        } catch (error) {
          frameGaps.push({
            cursor: frame.cursor,
            event_name: decoded.data.type,
            entity_id: decoded.data.entity_id,
            code: 'frame_decode_failed',
            reason: error instanceof Error ? error.message : 'Unable to decode live frame payload',
            received_at: frame.receivedAt,
          });
        }
      }

      return {
        entities,
        frameGaps: frameGaps.slice(-100),
        error: undefined,
      };
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
  reset: () => set({ entities: createEntityState(), frameGaps: [], error: undefined }),
}));
