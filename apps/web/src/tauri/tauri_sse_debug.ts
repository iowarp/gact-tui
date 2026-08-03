/**
 * Debug telemetry for the Rust SSE bridge (`openTauriSse`).
 *
 * The bridge dispatch in `tauri_sse.ts` is kept debug-free and testable in
 * isolation; it only emits structured state transitions. This module owns the
 * side-effecting sink that records the latest transition onto
 * `window.__gactSseDebug`, where the desktop dev tooling (and e2e probes) can
 * read it. Callers wire `createSseDebugRecorder()` into `openTauriSse` as the
 * optional `recordDebug` callback; passing nothing leaves the bridge silent.
 */

export interface SseBridgeDebugState {
  url: string;
  state:
    | 'idle'
    | 'importing'
    | 'invoking'
    | 'handle-ready'
    | 'open'
    | 'event'
    | 'error'
    | 'closed'
    | 'close-requested';
  lastMessage?: string;
  eventCount: number;
  openedAt?: number;
  updatedAt: number;
}

/** A debug sink: receives one partial bridge-state update per transition. */
export type SseDebugRecorder = (
  update: Partial<SseBridgeDebugState> & { url: string },
) => void;

interface SseDebugWindow extends Window {
  __gactSseDebug?: SseBridgeDebugState;
}

/** Read the last recorded bridge state, or undefined outside a browser. */
export function readSseDebugState(): SseBridgeDebugState | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as SseDebugWindow).__gactSseDebug;
}

/**
 * Build a recorder that folds each partial update onto the previous
 * `window.__gactSseDebug` snapshot. No-op outside a browser (e.g. unit tests
 * running in Node), which is why the bridge can stay portable.
 */
export function createSseDebugRecorder(): SseDebugRecorder {
  return (update) => {
    if (typeof window === 'undefined') return;
    const debugWindow = window as SseDebugWindow;
    const prev = debugWindow.__gactSseDebug;
    debugWindow.__gactSseDebug = {
      url: update.url,
      state: update.state ?? prev?.state ?? 'idle',
      lastMessage: update.lastMessage ?? prev?.lastMessage,
      eventCount: update.eventCount ?? prev?.eventCount ?? 0,
      openedAt: update.openedAt ?? prev?.openedAt,
      updatedAt: Date.now(),
    };
  };
}
