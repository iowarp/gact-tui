import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIVE_SSE_EVENT_TYPES } from '../../src/LiveConnectionConfig.js';
import {
  openLiveTranscriptBrowserStream,
} from '../../src/LiveTranscriptBrowserStream.js';

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  listeners = new Map<string, EventListener[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: EventListener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  removeEventListener(name: string, listener: EventListener) {
    this.listeners.set(
      name,
      (this.listeners.get(name) ?? []).filter((candidate) => candidate !== listener),
    );
  }

  close() {
    this.closed = true;
  }

  emit(name: string, data: string) {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data } as MessageEvent);
    }
  }
}

function installFakeEventSource() {
  FakeEventSource.instances = [];
  const original = globalThis.EventSource;
  vi.stubGlobal('EventSource', FakeEventSource);
  return () => {
    vi.stubGlobal('EventSource', original);
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openLiveTranscriptBrowserStream', () => {
  it('opens EventSource with configured URL and wires connection callbacks', () => {
    installFakeEventSource();
    const onOpen = vi.fn();
    const onError = vi.fn();

    openLiveTranscriptBrowserStream({
      sseUrl: '/v1/sessions/s1/events',
      onOpen,
      onError,
      onData: vi.fn(),
    });

    const source = FakeEventSource.instances[0];
    expect(source?.url).toBe('/v1/sessions/s1/events');
    source?.onopen?.();
    source?.onerror?.();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('routes every configured SSE event type to onData', () => {
    installFakeEventSource();
    const onData = vi.fn();

    openLiveTranscriptBrowserStream({
      sseUrl: '/events',
      onOpen: vi.fn(),
      onError: vi.fn(),
      onData,
    });

    const source = FakeEventSource.instances[0];
    for (const name of LIVE_SSE_EVENT_TYPES) {
      source?.emit(name, `payload:${name}`);
    }

    expect(onData).toHaveBeenCalledTimes(LIVE_SSE_EVENT_TYPES.length);
    expect(onData).toHaveBeenCalledWith(`payload:${LIVE_SSE_EVENT_TYPES[0]}`);
  });

  it('removes listeners and closes source on close', () => {
    installFakeEventSource();
    const onData = vi.fn();
    const stream = openLiveTranscriptBrowserStream({
      sseUrl: '/events',
      onOpen: vi.fn(),
      onError: vi.fn(),
      onData,
    });
    const source = FakeEventSource.instances[0];

    stream.close();
    source?.emit(LIVE_SSE_EVENT_TYPES[0], 'after-close');

    expect(source?.closed).toBe(true);
    expect(onData).not.toHaveBeenCalled();
  });
});
