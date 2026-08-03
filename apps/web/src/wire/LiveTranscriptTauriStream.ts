/**
 * Tauri (desktop) SSE transport: opens the Rust bridge with generation-based
 * staleness guarding and debug recording. Exports
 * {@link openLiveTranscriptTauriStream}.
 */
import { openTauriSse, type SseBridgeHandle, type SseBridgeHandlers } from '../tauri/tauri.js';
import { createSseDebugRecorder } from '../tauri/tauri_sse_debug.js';

type OpenTauriSse = (
  url: string,
  handlers: SseBridgeHandlers,
  lastEventId?: string,
) => Promise<SseBridgeHandle>;

/** Production bridge opener: records SSE telemetry to `window.__gactSseDebug`. */
const openTauriSseWithDebug: OpenTauriSse = (url, handlers, lastEventId) =>
  openTauriSse(url, handlers, createSseDebugRecorder(), lastEventId);

export interface LiveTranscriptTauriStreamOptions {
  sseUrl: string;
  generation: number;
  /** Last seen SSE id, echoed as Last-Event-ID so the bridge can resume. */
  lastEventId?: string;
  isStale: (generation: number) => boolean;
  setHandle: (handle: SseBridgeHandle | null) => void;
  onOpen: () => void;
  /** Raw SSE `data:` payload plus the event `id:` if present. */
  onData: (data: string, id?: string) => void;
  onFailure: () => void;
  openBridge?: OpenTauriSse;
}

export function openLiveTranscriptTauriStream(options: LiveTranscriptTauriStreamOptions): void {
  const openBridge = options.openBridge ?? openTauriSseWithDebug;
  const generation = options.generation;
  const stale = () => options.isStale(generation);
  let failed = false;

  const fail = () => {
    if (stale() || failed) return;
    failed = true;
    options.setHandle(null);
    options.onFailure();
  };

  void openBridge(
    options.sseUrl,
    {
      onOpen: () => {
        if (stale()) return;
        options.onOpen();
      },
      onData: (data, id) => {
        if (stale()) return;
        options.onData(data, id);
      },
      onError: fail,
      onClosed: fail,
    },
    options.lastEventId,
  )
    .then((handle) => {
      if (stale() || failed) {
        handle.close();
        return;
      }
      options.setHandle(handle);
    })
    .catch(fail);
}
