/**
 * Browser SSE transport: a `fetch`/`ReadableStream` reader (not the native
 * `EventSource`) so it can send the `Last-Event-ID` request header clio reads
 * as the resume cursor — `EventSource` has no header surface, and clio exposes
 * no query-param alias. Exports {@link openLiveTranscriptBrowserStream}.
 *
 * It performs no dedup or validity filtering: it forwards every event's raw
 * `data:` payload and its `id:` verbatim. Replay integrity is the server's job.
 */
import { openSseFetchStream, type SseFetchStream } from '@clio/core';

export interface LiveTranscriptBrowserStreamOptions {
  sseUrl: string;
  /** Last seen SSE id, echoed as Last-Event-ID so the server can resume. */
  lastEventId?: string;
  onOpen: () => void;
  onError: () => void;
  /** Raw SSE `data:` payload plus the event `id:` if present. */
  onData: (data: string, id?: string) => void;
}

export interface LiveTranscriptBrowserStream {
  close: () => void;
}

export function openLiveTranscriptBrowserStream(
  options: LiveTranscriptBrowserStreamOptions,
): LiveTranscriptBrowserStream {
  const stream: SseFetchStream = openSseFetchStream({
    url: options.sseUrl,
    lastEventId: options.lastEventId,
    onOpen: options.onOpen,
    onData: options.onData,
    onError: options.onError,
  });

  return {
    close: () => stream.close(),
  };
}
