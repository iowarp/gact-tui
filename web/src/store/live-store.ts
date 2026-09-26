import {
  createEntityState,
  type EntityState,
  type StreamState,
  type TransportGap,
  type TransportFrame,
} from '@clio/core/v3';
import { create } from 'zustand';
import { reduceFramesContained } from '@/lib/streaming/frame-reduction';
import { withoutEntitySessionModelReferences } from '@/lib/session-model-state';

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
  /**
   * How many session event streams are open. `entities.stream` is written only
   * by an open session stream, so on a route with none (Settings, the connect
   * page) it is stale; the connection indicator reads a service probe instead.
   */
  streamOwners: number;
  claimStream: () => void;
  releaseStream: () => void;
  setStreamState: (stream: StreamState) => void;
  setStreamError: (error: string) => void;
  applyFrames: (frames: readonly TransportFrame[]) => void;
  replaceSnapshots: (snapshot: Partial<EntityState>) => void;
  mergeSnapshots: (snapshot: Partial<EntityState>) => void;
  reconcileSnapshots: (snapshot: Partial<EntityState>) => void;
  clearSessionModelReferences: () => void;
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

/** `a2ui.action.*` statuses that will never change again — see below. */
const TERMINAL_A2UI_LIFECYCLE_STATUSES = new Set(['consumed', 'failed', 'duplicate']);

/**
 * `a2ui_action_lifecycles` (the action-lifecycle footer's data) is
 * stream-only — no REST endpoint returns it, so a `reconcileSnapshots`
 * snapshot never carries it, and the plain `{...state.entities, ...snapshot}`
 * spread below would otherwise leave a non-terminal status (`received`/
 * `delivered`) exactly as it was before the gap: a footer reading "received"
 * could show that forever after a reconnect, even though the true status may
 * have moved on or the events may simply never arrive again (S8 gact-tui#409
 * item 4, adversarial finding). A reconcile is the client's only honest
 * admission that it lost the thread — resident non-terminal entries are
 * remapped to the schema's own `unknown` status, which the footer already
 * renders as words ("... status unknown", `a2ui-action-lifecycle.tsx`).
 * Terminal statuses are left alone: they are true regardless of a gap.
 */
function markNonTerminalA2uiLifecyclesUnknown(
  lifecycles: EntityState['a2ui_action_lifecycles'],
): EntityState['a2ui_action_lifecycles'] {
  const entries = Object.entries(lifecycles);
  if (entries.every(([, lifecycle]) => TERMINAL_A2UI_LIFECYCLE_STATUSES.has(lifecycle.status))) {
    return lifecycles;
  }
  return Object.fromEntries(
    entries.map(([surfaceId, lifecycle]) =>
      TERMINAL_A2UI_LIFECYCLE_STATUSES.has(lifecycle.status)
        ? [surfaceId, lifecycle]
        : [surfaceId, { ...lifecycle, status: 'unknown' as const }],
    ),
  );
}

export const useLiveStore = create<LiveStore>((set) => ({
  entities: createEntityState(),
  frameGaps: [],
  streamOwners: 0,
  claimStream: () => set((state) => ({ streamOwners: state.streamOwners + 1 })),
  releaseStream: () => set((state) => ({ streamOwners: Math.max(0, state.streamOwners - 1) })),
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
        a2ui_action_lifecycles: markNonTerminalA2uiLifecyclesUnknown(
          state.entities.a2ui_action_lifecycles,
        ),
        cursor: undefined,
        processed_cursors: [],
      },
      error: undefined,
    })),
  clearSessionModelReferences: () =>
    set((state) => ({
      entities: {
        ...state.entities,
        sessions: withoutEntitySessionModelReferences(state.entities.sessions),
      },
    })),
  reset: () => set({ entities: createEntityState(), frameGaps: [], error: undefined }),
}));
