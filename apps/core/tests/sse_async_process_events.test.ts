/**
 * subscribeSessionAsyncProcessEvents (clio-agent#1205) — the async-processes
 * tray's live-refresh feed for durable MCP/relay task records. Mirrors
 * sse_message_events.test.ts exactly: per-type listeners, envelope
 * validation, verbatim delivery (no dedup, no reshaping).
 */
import { describe, expect, it } from 'vitest';
import {
  SESSION_MCP_TASK_EVENT_TYPES,
  subscribeSessionAsyncProcessEvents,
  type SessionMcpTaskEvent,
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

function subscribe(onEvent: (event: SessionMcpTaskEvent) => void) {
  const subscription = subscribeSessionAsyncProcessEvents(
    'http://x/v1/sessions/sess_1/events',
    onEvent,
    (url) => new FakeEventSource(url) as unknown as EventSource,
  );
  const source = FakeEventSource.instances[FakeEventSource.instances.length - 1]!;
  return { subscription, source };
}

describe('subscribeSessionAsyncProcessEvents', () => {
  it('listens for the full mcp-task-lifecycle vocabulary', () => {
    const { source } = subscribe(() => {});
    for (const type of SESSION_MCP_TASK_EVENT_TYPES) {
      expect(source.listeners.get(type)?.length, type).toBe(1);
    }
    expect(SESSION_MCP_TASK_EVENT_TYPES).toEqual([
      'mcp_task.updated',
      'mcp_task.completed',
      'mcp_task.failed',
      'mcp_task.cancelled',
    ]);
  });

  it('delivers the full TaskRecord wire projection verbatim, unreshaped', () => {
    const events: SessionMcpTaskEvent[] = [];
    const { source } = subscribe((event) => events.push(event));
    source.emit(
      'mcp_task.completed',
      JSON.stringify({
        type: 'mcp_task.completed',
        occurred_at: '2026-08-12T12:00:00Z',
        payload: {
          key: { server_id: 'relay-ares', session_id: 'sess_1', task_id: 'jarvis-1' },
          tool: 'jarvis_run',
          status: 'completed',
          created_at: '2026-08-12T11:58:00Z',
          updated_at: '2026-08-12T12:00:00Z',
        },
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('mcp_task.completed');
    const payload = events[0]!.payload as { key: { task_id: string }; tool: string };
    expect(payload.key.task_id).toBe('jarvis-1');
    expect(payload.tool).toBe('jarvis_run');
  });

  it('rejects a mislabeled or payload-less envelope instead of dispatching garbage', () => {
    const events: SessionMcpTaskEvent[] = [];
    const { source } = subscribe((event) => events.push(event));
    source.emit(
      'mcp_task.updated',
      JSON.stringify({ type: 'mcp_task.failed', occurred_at: 'x', payload: {} }),
    );
    source.emit('mcp_task.updated', JSON.stringify({ type: 'mcp_task.updated' }));
    source.emit('mcp_task.updated', 'not-json');
    expect(events).toHaveLength(0);
  });

  it('close() detaches every listener and closes the source', () => {
    const { subscription, source } = subscribe(() => {});
    subscription.close();
    expect(source.closed).toBe(true);
    for (const type of SESSION_MCP_TASK_EVENT_TYPES) {
      expect(source.listeners.get(type)).toHaveLength(0);
    }
  });
});
