/**
 * Rust SSE bridge transport for the desktop shell.
 *
 * `openTauriSse` opens an SSE stream through the Rust `gact_sse_open` command
 * instead of a raw browser `EventSource`, then dispatches each bridge message
 * to typed handlers. The dispatch logic here is deliberately debug-free: all
 * telemetry is funnelled through the optional `recordDebug` callback so the
 * bridge can be tested in isolation (see `tauri_sse_debug.ts` for the sink that
 * writes to `window.__gactSseDebug`).
 */

import { createChannel, invoke, listen } from './tauriApi.js';
import { inTauri } from './tauri_runtime.js';
import type { SseDebugRecorder } from './tauri_sse_debug.js';

export type { SseBridgeDebugState, SseDebugRecorder } from './tauri_sse_debug.js';

interface SseBridgeMessage {
  kind: 'open' | 'event' | 'error' | 'closed';
  data?: string;
  message?: string;
}

export interface SseBridgeHandle {
  close: () => void;
}

export interface SseBridgeHandlers {
  onOpen: () => void;
  /** Raw SSE `data:` payload (a JSON envelope) for one event. */
  onData: (data: string) => void;
  onError: (message?: string) => void;
  onClosed: () => void;
}

interface SseBridgeEventPayload {
  client_id: string;
  message: SseBridgeMessage;
}

/** Dispatch one bridge message to handlers, recording telemetry via `record`. */
function dispatchSseBridgeMessage(
  url: string,
  handlers: SseBridgeHandlers,
  record: SseDebugRecorder,
  state: { eventCount: number },
  m: SseBridgeMessage,
) {
  switch (m.kind) {
    case 'open':
      record({ url, state: 'open', openedAt: Date.now() });
      handlers.onOpen();
      break;
    case 'event':
      if (typeof m.data === 'string') {
        state.eventCount += 1;
        record({
          url,
          state: 'event',
          eventCount: state.eventCount,
          lastMessage: m.data.slice(0, 240),
        });
        handlers.onData(m.data);
      }
      break;
    case 'error':
      record({ url, state: 'error', lastMessage: m.message ?? 'sse bridge error' });
      handlers.onError(m.message);
      break;
    case 'closed':
      record({ url, state: 'closed' });
      handlers.onClosed();
      break;
  }
}

/**
 * Open an SSE stream through the Rust `gact_sse_open` bridge instead of
 * a raw browser `EventSource`. Rust reads the stream (no WebView CORS
 * layer) and forwards each event's data over a Tauri Channel. This is
 * what makes desktop live-streaming independent of clio's CORS headers
 * — and lets the bearer token ride along (EventSource can't set headers;
 * the token travels in the sseUrl query string per SPEC §7). See
 * `apps/SECURITY.md` + issue #111.
 *
 * Pure-web build: callers should guard via `inTauri()` and fall back to
 * `new EventSource(...)`.
 *
 * Pass `recordDebug` (e.g. from `createSseDebugRecorder()`) to capture bridge
 * telemetry; omit it to run the bridge silently (the default in tests).
 */
export async function openTauriSse(
  url: string,
  handlers: SseBridgeHandlers,
  recordDebug?: SseDebugRecorder,
): Promise<SseBridgeHandle> {
  if (!inTauri()) {
    throw new Error('openTauriSse() called outside Tauri shell');
  }
  const record: SseDebugRecorder = recordDebug ?? (() => {});
  const debugState = { eventCount: 0 };
  record({ url, state: 'importing', eventCount: 0 });
  record({ url, state: 'invoking', eventCount: 0 });
  const clientId = `sse-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const unlisten = await listen<SseBridgeEventPayload>('gact:sse', (event) => {
    if (event.payload.client_id !== clientId) return;
    dispatchSseBridgeMessage(url, handlers, record, debugState, event.payload.message);
  });
  const ch = await createChannel<SseBridgeMessage>();
  // Linux WebKit CI proved Rust can send over Channel while the frontend
  // callback never fires. Keep the Channel for command compatibility, but
  // consume the keyed Tauri event above as the live transcript transport.
  ch.onmessage = (m) => {
    record({ url, state: `channel-${m.kind}` });
  };
  const id = await invoke<number>('gact_sse_open', {
    url,
    headers: {},
    onEvent: ch,
    clientId,
  });
  record({ url, state: 'handle-ready' });
  return {
    close: () => {
      record({ url, state: 'close-requested' });
      unlisten();
      void invoke('gact_sse_close', { id });
    },
  };
}
