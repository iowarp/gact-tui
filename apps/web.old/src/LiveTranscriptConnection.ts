/**
 * Owns the SSE transport for a session: opens the browser EventSource (or the
 * Tauri Rust bridge), wires status/data callbacks, and drives reconnect backoff.
 */
import type { Setter } from 'solid-js';
import { createLiveReconnectScheduler, type LiveConnectionStatus } from './LiveReconnect.js';
import { inTauri, type SseBridgeHandle } from './tauri.js';
import { LIVE_RECONNECT_BACKOFF_SECONDS } from './LiveConnectionConfig.js';
import {
  openLiveTranscriptBrowserStream,
  type LiveTranscriptBrowserStream,
} from './LiveTranscriptBrowserStream.js';
import { installLiveTranscriptConnectionListeners } from './LiveTranscriptConnectionListeners.js';
import { openLiveTranscriptTauriStream } from './LiveTranscriptTauriStream.js';

export interface LiveTranscriptConnectionOptions {
  sseUrl: string;
  setStatus: Setter<LiveConnectionStatus>;
  setReconnectInSec: Setter<number>;
  onData: (data: string) => void;
  onConnectionLost: () => void;
  onFocus: () => void;
}

export interface LiveTranscriptConnection {
  reconnectNow: () => void;
  close: () => void;
}

export function openLiveTranscriptConnection(
  options: LiveTranscriptConnectionOptions,
): LiveTranscriptConnection {
  let browserStream: LiveTranscriptBrowserStream | null = null;
  // Desktop (Tauri) routes SSE through the Rust bridge instead of a raw
  // EventSource so live-streaming doesn't depend on clio's CORS (see
  // tauri.ts openTauriSse + issue #111). `bridge` holds the close handle;
  // `bridgeGen` invalidates in-flight async callbacks after teardown.
  let bridge: SseBridgeHandle | null = null;
  let bridgeGen = 0;
  let disposed = false;
  // Last SSE id observed on this connection. Echoed as Last-Event-ID on every
  // (re)connect so the server resumes from where we left off. Only updated
  // from events that actually carried an id: — the client never invents one,
  // and it does no dedup (replay integrity is server-owned).
  let lastEventId: string | undefined;

  function recordData(data: string, id?: string) {
    if (id) lastEventId = id;
    options.onData(data);
  }

  const reconnectScheduler = createLiveReconnectScheduler({
    backoffSeconds: LIVE_RECONNECT_BACKOFF_SECONDS,
    isDisposed: () => disposed,
    setStatus: options.setStatus,
    setReconnectInSec: options.setReconnectInSec,
    onReconnect: () => openEs(),
  });

  function teardownEs() {
    // Invalidate any in-flight bridge callbacks (open resolves async).
    bridgeGen += 1;
    if (bridge) {
      bridge.close();
      bridge = null;
    }
    if (browserStream) {
      browserStream.close();
      browserStream = null;
    }
  }

  // Raw browser EventSource path — used only by the pure-web build.
  // Desktop/Tauri must stay on the Rust bridge so the WebView never
  // depends on CLIO CORS for live streaming.
  function openEventSource() {
    browserStream = openLiveTranscriptBrowserStream({
      sseUrl: options.sseUrl,
      lastEventId,
      onData: recordData,
      onOpen: () => {
        reconnectScheduler.resetAttempts();
        options.setStatus('open');
      },
      onError: () => {
        // EventSource emits onerror both on transient hiccups and on
        // permanent close. We treat it uniformly: tear down and back
        // off. Browser's auto-reconnect is unreliable when the server
        // rejects mid-stream — explicit control is safer.
        options.onConnectionLost();
        teardownEs();
        options.setStatus('error');
        reconnectScheduler.schedule();
      },
    });
  }

  function openEs() {
    if (disposed) return;
    teardownEs();
    options.setStatus('connecting');

    // Desktop: always use the Rust SSE bridge (CORS-independent, carries
    // the bearer token an EventSource can't — see issue #111). If the
    // bridge fails to open or drops, retry the bridge through the normal
    // reconnect ladder instead of falling back to a raw EventSource.
    // teardownEs() bumped bridgeGen, so capture it and ignore any callback
    // from a stream that's since been torn down (open resolves async).
    if (inTauri()) {
      openLiveTranscriptTauriStream({
        sseUrl: options.sseUrl,
        generation: bridgeGen,
        lastEventId,
        isStale: (generation) => generation !== bridgeGen || disposed,
        setHandle: (handle) => {
          bridge = handle;
        },
        onOpen: () => {
          reconnectScheduler.resetAttempts();
          options.setStatus('open');
        },
        onData: recordData,
        onFailure: () => {
          options.onConnectionLost();
          options.setStatus('error');
          reconnectScheduler.schedule();
        },
      });
      return;
    }

    openEventSource();
  }

  // Hardening (W4): react to the OS/browser network state. A dropped
  // network does NOT error an established EventSource — it just goes
  // silently dead — so on `offline` tear the stream down and start the
  // reconnect ladder; on `online` reconnect immediately instead of
  // waiting out the backoff. Covers laptop sleep/wake + wifi switching.
  const removeConnectionListeners = installLiveTranscriptConnectionListeners({
    isDisposed: () => disposed,
    teardown: teardownEs,
    setStatus: options.setStatus,
    scheduleReconnect: () => reconnectScheduler.schedule(),
    reconnectNow: () => reconnectScheduler.reconnectNow(),
    onFocus: options.onFocus,
  });

  openEs();

  return {
    reconnectNow: () => reconnectScheduler.reconnectNow(),
    close: () => {
      disposed = true;
      removeConnectionListeners();
      reconnectScheduler.clear();
      teardownEs();
      options.setStatus('closed');
    },
  };
}
