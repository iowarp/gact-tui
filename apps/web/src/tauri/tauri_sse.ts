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

import { invoke, listen } from './tauriApi.js';
import { inTauri } from './tauri_runtime.js';
import type { SseDebugRecorder } from './tauri_sse_debug.js';

export type { SseBridgeDebugState, SseDebugRecorder } from './tauri_sse_debug.js';

interface SseBridgeMessage {
  kind: 'open' | 'event' | 'error' | 'closed';
  data?: string;
  /** The SSE `id:` value for this event, when present (for Last-Event-ID). */
  id?: string;
  message?: string;
}

export interface SseBridgeHandle {
  close: () => void;
}

export interface SseBridgeHandlers {
  onOpen: () => void;
  /** Raw SSE `data:` payload (a JSON envelope) plus the event `id:` if any. */
  onData: (data: string, id?: string) => void;
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
        handlers.onData(m.data, m.id);
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
 * layer) and forwards each event's data over the keyed global `gact:sse`
 * Tauri event (filtered by `client_id`). This is
 * what makes desktop live-streaming independent of clio's CORS headers
 * — and lets the bearer token ride along (EventSource can't set headers;
 * the token travels in the sseUrl query string per SPEC §7). See
 * `apps/SECURITY.md` + issue #111.
 *
 * As of gact-tui#365, no caller wires this in: the live transcript path
 * (SessionView's `subscribeSessionMessageEvents`) always opens a plain
 * browser `EventSource`, on desktop too — the `Live*` dispatch stack that
 * would have chosen between this bridge and a fetch-based reader per
 * `inTauri()` was deleted as an orphaned island (17 files, zero consumers
 * since the 2026-08-03 React rebuild). This function still encodes a real,
 * untouched capability (native `EventSource` cannot set an `Authorization`
 * header, so a desktop build behind a bearer token needs this bridge or an
 * equivalent) — the re-wire-vs-retire decision is tracked as gact-tui#367.
 *
 * Pass `recordDebug` (e.g. from `createSseDebugRecorder()`) to capture bridge
 * telemetry; omit it to run the bridge silently (the default in tests).
 */
export async function openTauriSse(
  url: string,
  handlers: SseBridgeHandlers,
  recordDebug?: SseDebugRecorder,
  lastEventId?: string,
): Promise<SseBridgeHandle> {
  if (!inTauri()) {
    throw new Error('openTauriSse() called outside Tauri shell');
  }
  const record: SseDebugRecorder = recordDebug ?? (() => {});
  const debugState = { eventCount: 0 };
  record({ url, state: 'importing', eventCount: 0 });
  record({ url, state: 'invoking', eventCount: 0 });
  const clientId = `sse-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  // The keyed global `gact:sse` event (filtered by client_id) is the sole
  // transport: the Rust bridge emits every message there. An earlier build
  // also mirrored messages over a per-command Tauri Channel, which caused
  // double delivery; that Channel is gone on both sides.
  const unlisten = await listen<SseBridgeEventPayload>('gact:sse', (event) => {
    if (event.payload.client_id !== clientId) return;
    dispatchSseBridgeMessage(url, handlers, record, debugState, event.payload.message);
  });
  // clio reads the resume cursor only from the Last-Event-ID header; the
  // Rust bridge already forwards this headers map on the request, so no
  // command-signature change is needed.
  const headers: Record<string, string> = {};
  if (lastEventId) headers['Last-Event-ID'] = lastEventId;
  const id = await invoke<number>('gact_sse_open', {
    url,
    headers,
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
