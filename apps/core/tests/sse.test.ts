import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  openSseFetchStream,
  parseSseBlock,
  parseSseFields,
} from '../src/client/sse.js';

const FIXTURE_PATH = new URL('../../../contract/testdata/sse_edge_cases.sse', import.meta.url);
const FIXTURE = readFileSync(FIXTURE_PATH, 'utf8');

describe('parseSseBlock — SPEC §7.2 envelope', () => {
  it('parses a well-formed event block with payload', () => {
    const block = [
      'event: session.status_changed',
      'id: 7',
      'data: {"type":"session.status_changed","occurred_at":"2026-05-27T12:00:00Z","payload":{"session_id":"s1","status":"running","prev_status":"idle"}}',
    ].join('\n');
    const ev = parseSseBlock(block);
    expect(ev?.type).toBe('session.status_changed');
    expect(ev?.occurred_at).toBe('2026-05-27T12:00:00Z');
    expect(ev?.payload).toEqual({
      session_id: 's1',
      status: 'running',
      prev_status: 'idle',
    });
  });

  it('returns null on missing event line', () => {
    expect(
      parseSseBlock('data: {"occurred_at":"2026-05-27T12:00:00Z","payload":{}}'),
    ).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseSseBlock('event: x\ndata: not-json')).toBeNull();
  });

  it('tolerates CRLF line endings (sse-starlette compatibility)', () => {
    const block =
      'event: cost.updated\r\ndata: {"type":"cost.updated","occurred_at":"2026-05-27T12:00:00Z","payload":{"session_id":"s","cost_usd":0.01}}\r\n';
    const ev = parseSseBlock(block);
    expect(ev?.type).toBe('cost.updated');
    expect((ev?.payload as { session_id?: string })?.session_id).toBe('s');
  });

  it('prefers data.type over the event: header when both present', () => {
    const block = [
      'event: legacy-name',
      'data: {"type":"message.created","occurred_at":"2026-05-27T12:00:00Z","payload":{"message":{"id":"m1","role":"assistant","parts":[]}}}',
    ].join('\n');
    const ev = parseSseBlock(block);
    expect(ev?.type).toBe('message.created');
  });

  it('tolerates missing payload (server.heartbeat ships an empty object)', () => {
    const block = [
      'event: server.heartbeat',
      'data: {"type":"server.heartbeat","occurred_at":"2026-05-27T12:00:00Z"}',
    ].join('\n');
    const ev = parseSseBlock(block);
    expect(ev?.type).toBe('server.heartbeat');
    expect(ev?.payload).toEqual({});
  });
});

describe('parseSseFields — WHATWG field parsing', () => {
  it('captures id, event, and accumulates multi-line data', () => {
    const block = ['id:7', 'event:message.created', 'data:{"a":1,', 'data:"b":2}'].join('\n');
    const fields = parseSseFields(block);
    expect(fields).toEqual({ id: '7', event: 'message.created', data: '{"a":1,\n"b":2}' });
  });

  it('strips exactly one leading space from a value', () => {
    expect(parseSseFields('data:  x')?.data).toBe(' x'); // two spaces → one survives
    expect(parseSseFields('data: x')?.data).toBe('x');
    expect(parseSseFields('data:x')?.data).toBe('x');
  });

  it('ignores comments and unknown fields', () => {
    const block = [': keep-alive', 'retry: 5000', 'x-vendor: whatever', 'data: hi'].join('\n');
    expect(parseSseFields(block)).toEqual({ id: undefined, event: undefined, data: 'hi' });
  });

  it('returns null for a block with no data field', () => {
    expect(parseSseFields('id: 4\nevent: message.created')).toBeNull();
    expect(parseSseFields(': lone comment')).toBeNull();
  });

  it('leaves id undefined when the event carries none', () => {
    expect(parseSseFields('data: {"type":"x"}')?.id).toBeUndefined();
  });
});

describe('shared edge-case fixture (contract/testdata/sse_edge_cases.sse)', () => {
  // Split the raw stream into blocks the way the streaming reader does, then
  // parse each. Must agree with the Go/Rust parsers on the same four events.
  function parseStream(raw: string): ReturnType<typeof parseSseFields>[] {
    return raw
      .split(/\r?\n\r?\n/)
      .map((block) => parseSseFields(block))
      .filter((fields): fields is NonNullable<typeof fields> => fields !== null);
  }

  it('decodes to exactly four events, matching the Go/Rust parsers', () => {
    const events = parseStream(FIXTURE);
    expect(events).toHaveLength(4);

    expect(events[0]?.id).toBe('1');
    expect(JSON.parse(events[0]!.data)).toMatchObject({
      type: 'message.created',
      payload: { n: 1 },
    });

    expect(events[1]?.id).toBe('2');
    expect(JSON.parse(events[1]!.data)).toMatchObject({
      type: 'message.part.delta',
      payload: { text: 'hi' },
    });

    // Multi-line data joined with newlines is still valid JSON.
    expect(events[2]?.id).toBe('3');
    expect(JSON.parse(events[2]!.data)).toMatchObject({
      type: 'message.completed',
      payload: { ok: true },
    });

    // Fourth event has no id: and no event:.
    expect(events[3]?.id).toBeUndefined();
    expect(JSON.parse(events[3]!.data)).toMatchObject({ type: 'server.heartbeat' });
  });
});

describe('openSseFetchStream — fetch/ReadableStream transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('sends Last-Event-ID and forwards each event data + id, then errors on end', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedInit = init;
      return { ok: true, status: 200, body: streamFrom([FIXTURE]) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const onOpen = vi.fn();
    const onData = vi.fn();
    await new Promise<void>((resolve) => {
      openSseFetchStream({
        url: 'http://x/v1/sessions/s/events',
        lastEventId: '41',
        onOpen,
        onData,
        onError: () => resolve(), // stream end → onError with no arg
      });
    });

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['Last-Event-ID']).toBe('41');
    expect(headers['Accept']).toBe('text/event-stream');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onData).toHaveBeenCalledTimes(4);
    expect(onData).toHaveBeenNthCalledWith(1, expect.stringContaining('message.created'), '1');
    expect(onData).toHaveBeenNthCalledWith(4, expect.stringContaining('server.heartbeat'), undefined);
  });

  it('reassembles events split across chunk boundaries', async () => {
    const raw = 'id: 1\ndata: {"type":"a"}\n\nid: 2\ndata: {"type":"b"}\n\n';
    // Cut mid-way through the first event so a boundary spans two reads.
    const mid = raw.indexOf('data') + 4;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        body: streamFrom([raw.slice(0, mid), raw.slice(mid)]),
      })) as unknown as typeof fetch,
    );

    const onData = vi.fn();
    await new Promise<void>((resolve) => {
      openSseFetchStream({
        url: 'http://x/events',
        onOpen: vi.fn(),
        onData,
        onError: () => resolve(),
      });
    });

    expect(onData).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenNthCalledWith(1, '{"type":"a"}', '1');
    expect(onData).toHaveBeenNthCalledWith(2, '{"type":"b"}', '2');
  });

  it('reports a non-OK response through onError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, body: null })) as unknown as typeof fetch,
    );
    const onError = vi.fn();
    const onOpen = vi.fn();
    await new Promise<void>((resolve) => {
      openSseFetchStream({
        url: 'http://x/events',
        onOpen,
        onData: vi.fn(),
        onError: (err) => {
          onError(err);
          resolve();
        },
      });
    });
    expect(onOpen).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('does not fire onError after close()', async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        capturedInit = init;
        // Never-closing stream so the reader stays parked until abort.
        return {
          ok: true,
          status: 200,
          body: new ReadableStream<Uint8Array>({ pull() {} }),
        } as unknown as Response;
      }) as unknown as typeof fetch,
    );
    const onError = vi.fn();
    const stream = openSseFetchStream({
      url: 'http://x/events',
      onOpen: vi.fn(),
      onData: vi.fn(),
      onError,
    });
    // Let the fetch resolve and the reader park.
    await new Promise((r) => setTimeout(r, 0));
    stream.close();
    expect((capturedInit?.signal as AbortSignal | undefined)?.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).not.toHaveBeenCalled();
  });
});
