/**
 * Browser SSE transport: wraps the native `EventSource`, subscribing to every
 * known event name and exposing a clean teardown. Exports
 * {@link openLiveTranscriptBrowserStream}.
 */
import { LIVE_SSE_EVENT_TYPES } from './LiveConnectionConfig.js';

export interface LiveTranscriptBrowserStreamOptions {
  sseUrl: string;
  onOpen: () => void;
  onError: () => void;
  onData: (data: string) => void;
}

export interface LiveTranscriptBrowserStream {
  close: () => void;
}

export function openLiveTranscriptBrowserStream(
  options: LiveTranscriptBrowserStreamOptions,
): LiveTranscriptBrowserStream {
  const source = new EventSource(options.sseUrl);
  const onEvent = (raw: MessageEvent) => options.onData(raw.data);

  source.onopen = options.onOpen;
  source.onerror = options.onError;
  for (const name of LIVE_SSE_EVENT_TYPES) {
    source.addEventListener(name, onEvent as EventListener);
  }

  return {
    close: () => {
      for (const name of LIVE_SSE_EVENT_TYPES) {
        source.removeEventListener(name, onEvent as EventListener);
      }
      source.close();
    },
  };
}
