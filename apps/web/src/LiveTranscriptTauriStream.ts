/**
 * Tauri (desktop) SSE transport: opens the Rust bridge with generation-based
 * staleness guarding and debug recording. Exports
 * {@link openLiveTranscriptTauriStream}.
 */
import { openTauriSse, type SseBridgeHandle, type SseBridgeHandlers } from './tauri.js';
import { createSseDebugRecorder } from './tauri_sse_debug.js';

type OpenTauriSse = (url: string, handlers: SseBridgeHandlers) => Promise<SseBridgeHandle>;

/** Production bridge opener: records SSE telemetry to `window.__gactSseDebug`. */
const openTauriSseWithDebug: OpenTauriSse = (url, handlers) =>
  openTauriSse(url, handlers, createSseDebugRecorder());

export interface LiveTranscriptTauriStreamOptions {
  sseUrl: string;
  generation: number;
  isStale: (generation: number) => boolean;
  setHandle: (handle: SseBridgeHandle | null) => void;
  onOpen: () => void;
  onData: (data: string) => void;
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

  void openBridge(options.sseUrl, {
    onOpen: () => {
      if (stale()) return;
      options.onOpen();
    },
    onData: (data) => {
      if (stale()) return;
      options.onData(data);
    },
    onError: fail,
    onClosed: fail,
  })
    .then((handle) => {
      if (stale() || failed) {
        handle.close();
        return;
      }
      options.setHandle(handle);
    })
    .catch(fail);
}
