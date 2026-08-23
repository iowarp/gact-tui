import type { SemanticEventPayload } from '../wire/event_payloads.js';
import type { HttpTransport } from './transport.js';

type SessionTraceTransport = Pick<HttpTransport, 'get'>;

/**
 * Response from the durable semantic trace read
 * (`GET /v1/sessions/{sid}/trace`): the newest bounded events of the
 * session's canonical ARC log, in oldest-first order. Each event is the
 * same `SemanticEventPayload` dict the live SSE stream publishes under
 * `semantic.event` — `tool.call.completed` payloads carry the wire's own
 * keys (`tool`, `ok`, `duration_ms`, `call_id`), and every event carries
 * its real `occurred_at`.
 */
export interface SessionTraceResult {
  events: SemanticEventPayload[];
}

export interface SessionTraceOptions {
  /**
   * Maximum number of latest matching events to return. The server bounds
   * this to 1..2000 (default 500) and rejects out-of-range values with a
   * 422 — passed through verbatim, never silently clamped.
   */
  limit?: number;
  /** Optional exact event type or dotted-prefix namespace (e.g. "tool.call"). */
  scope?: string;
}

/**
 * Read a session's durable semantic trace, oldest-first.
 *
 * This is the only wire that carries per-tool `occurred_at` + real
 * `duration_ms` for settled sessions, which is what the observability
 * layer merges across a session tree (parent plus children).
 */
export function fetchSessionTrace(
  client: SessionTraceTransport,
  sessionId: string,
  options: SessionTraceOptions = {},
): Promise<SessionTraceResult> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.scope) params.set('scope', options.scope);
  const query = params.size > 0 ? `?${params.toString()}` : '';
  return client.get(`/v1/sessions/${encodeURIComponent(sessionId)}/trace${query}`);
}
