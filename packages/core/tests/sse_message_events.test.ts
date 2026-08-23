/**
 * subscribeSessionMessageEvents — the live-transcript feed off the session
 * SSE stream. The transport is a pure applier: per-type listeners, envelope
 * validation, verbatim delivery (no dedup, no reshaping — the clean-wire
 * rule puts that responsibility on clio-agent).
 */
import { describe, expect, it } from 'vitest';
import {
  SESSION_MESSAGE_EVENT_TYPES,
  subscribeSessionMessageEvents,
  type SessionMessageEvent,
} from '../src/client/sse.js';

type Listener = (event: MessageEvent<string>) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Listener[]>();
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: EventListener) {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener as unknown as Listener);
    this.listeners.set(type, bucket);
  }
  removeEventListener(type: string, listener: EventListener) {
    const bucket = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      bucket.filter((l) => l !== (listener as unknown as Listener)),
    );
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data } as MessageEvent<string>);
    }
  }
}

function subscribe(onEvent: (event: SessionMessageEvent) => void) {
  const subscription = subscribeSessionMessageEvents(
    'http://x/v1/sessions/sess_1/events',
    onEvent,
    (url) => new FakeEventSource(url) as unknown as EventSource,
  );
  const source = FakeEventSource.instances[FakeEventSource.instances.length - 1]!;
  return { subscription, source };
}

describe('subscribeSessionMessageEvents', () => {
  it('listens for the full message-lifecycle vocabulary, including part.updated', () => {
    const { source } = subscribe(() => {});
    for (const type of SESSION_MESSAGE_EVENT_TYPES) {
      expect(source.listeners.get(type)?.length, type).toBe(1);
    }
    expect(SESSION_MESSAGE_EVENT_TYPES).toContain('message.part.updated');
  });

  it('delivers a message.part.updated envelope verbatim (the in-place delegation settle)', () => {
    const events: SessionMessageEvent[] = [];
    const { source } = subscribe((event) => events.push(event));
    source.emit(
      'message.part.updated',
      JSON.stringify({
        type: 'message.part.updated',
        occurred_at: '2026-08-05T12:00:00Z',
        payload: {
          message_id: 'msg_1',
          part: {
            id: 'p1',
            type: 'expert_handoff',
            stage: 'delegate.completed',
            handle_id: 'task_1',
            metadata: { question: 'brief', output: 'answer' },
          },
        },
      }),
    );
    expect(events).toHaveLength(1);
    const part = (events[0]!.payload as { part: Record<string, unknown> }).part;
    expect(part['stage']).toBe('delegate.completed');
    expect(part['handle_id']).toBe('task_1');
  });

  it('rejects a mislabeled or payload-less envelope instead of dispatching garbage', () => {
    const events: SessionMessageEvent[] = [];
    const { source } = subscribe((event) => events.push(event));
    source.emit(
      'message.part.added',
      JSON.stringify({ type: 'message.part.delta', occurred_at: 'x', payload: {} }),
    );
    source.emit('message.part.added', JSON.stringify({ type: 'message.part.added' }));
    source.emit('message.part.added', 'not-json');
    expect(events).toHaveLength(0);
  });

  it('close() detaches every listener and closes the source', () => {
    const { subscription, source } = subscribe(() => {});
    subscription.close();
    expect(source.closed).toBe(true);
    for (const type of SESSION_MESSAGE_EVENT_TYPES) {
      expect(source.listeners.get(type)).toHaveLength(0);
    }
  });
});
