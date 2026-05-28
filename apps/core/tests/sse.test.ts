import { describe, expect, it } from 'vitest';
import { parseSseBlock } from '../src/client/sse.js';

describe('parseSseBlock', () => {
  it('parses a well-formed event block', () => {
    const block = [
      'event: session.status',
      'data: {"occurred_at":"2026-05-27T12:00:00Z","session_id":"s1","status":"running"}',
    ].join('\n');
    const ev = parseSseBlock(block);
    expect(ev?.type).toBe('session.status');
    // Parser spreads the data JSON across the envelope; see parseSseBlock JSDoc.
    expect((ev as unknown as { session_id?: string }).session_id).toBe('s1');
    expect(ev?.occurred_at).toBe('2026-05-27T12:00:00Z');
  });

  it('returns null on missing event line', () => {
    expect(parseSseBlock('data: {"occurred_at":"2026-05-27T12:00:00Z"}')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseSseBlock('event: x\ndata: not-json')).toBeNull();
  });

  it('tolerates CRLF line endings (sse-starlette compatibility)', () => {
    const block = 'event: usage\r\ndata: {"occurred_at":"2026-05-27T12:00:00Z","session_id":"s","input_tokens":1,"output_tokens":2,"total_tokens":3}\r\n';
    const ev = parseSseBlock(block);
    expect(ev?.type).toBe('usage');
  });
});
