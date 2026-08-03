import { afterEach, describe, expect, it, vi } from 'vitest';
import { openLiveTranscriptBrowserStream } from '../../src/LiveTranscriptBrowserStream.js';

// The browser stream now uses a fetch/ReadableStream reader (not EventSource)
// so it can send the Last-Event-ID header clio reads for resume.

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i]!));
        i += 1;
      } else {
        controller.close();
      }
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openLiveTranscriptBrowserStream', () => {
  it('opens the SSE URL, forwards data + id, and signals open', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedInit = init;
        return {
          ok: true,
          status: 200,
          body: streamFrom(['id: 12\ndata: {"type":"message.created"}\n\n']),
        } as unknown as Response;
      }) as unknown as typeof fetch,
    );

    const onOpen = vi.fn();
    const onData = vi.fn();
    await new Promise<void>((resolve) => {
      openLiveTranscriptBrowserStream({
        sseUrl: '/v1/sessions/s1/events',
        onOpen,
        onError: () => resolve(),
        onData,
      });
    });

    expect(capturedUrl).toBe('/v1/sessions/s1/events');
    expect((capturedInit?.headers as Record<string, string>)['Accept']).toBe('text/event-stream');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onData).toHaveBeenCalledWith('{"type":"message.created"}', '12');
  });

  it('echoes the last seen id as Last-Event-ID on connect', async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        capturedInit = init;
        return { ok: true, status: 200, body: streamFrom([]) } as unknown as Response;
      }) as unknown as typeof fetch,
    );

    await new Promise<void>((resolve) => {
      openLiveTranscriptBrowserStream({
        sseUrl: '/events',
        lastEventId: '99',
        onOpen: vi.fn(),
        onError: () => resolve(),
        onData: vi.fn(),
      });
    });

    expect((capturedInit?.headers as Record<string, string>)['Last-Event-ID']).toBe('99');
  });

  it('aborts the request on close', async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        capturedInit = init;
        // Never-closing stream so close() is what tears it down.
        return {
          ok: true,
          status: 200,
          body: new ReadableStream<Uint8Array>({ pull() {} }),
        } as unknown as Response;
      }) as unknown as typeof fetch,
    );

    const onError = vi.fn();
    const stream = openLiveTranscriptBrowserStream({
      sseUrl: '/events',
      onOpen: vi.fn(),
      onError,
      onData: vi.fn(),
    });
    await new Promise((r) => setTimeout(r, 0));
    stream.close();

    expect((capturedInit?.signal as AbortSignal | undefined)?.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).not.toHaveBeenCalled();
  });
});
