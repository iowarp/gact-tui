import { describe, expect, it } from 'vitest';
import { parseSseBlock } from '../src/client/sse.js';

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
