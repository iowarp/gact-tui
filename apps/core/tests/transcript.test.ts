import { describe, expect, it } from 'vitest';
import {
  applyTextAppend,
  applyTextAppendAtIndex,
  appendPart,
  upsertMessage,
} from '../src/store/transcript.js';
import type { Message } from '../src/wire/types.js';

const baseMsg: Message = {
  id: 'm1',
  role: 'assistant',
  parts: [{ id: 'p1', type: 'text', text: 'Hello' }],
};

describe('transcript store', () => {
  it('applies text_append by part id (spec path)', () => {
    const out = applyTextAppend([baseMsg], 'm1', 'p1', ', world');
    expect((out[0]!.parts[0] as { text: string }).text).toBe('Hello, world');
  });

  it('no-ops text_append on unknown message id', () => {
    const out = applyTextAppend([baseMsg], 'mX', 'p1', '!!');
    expect(out).toEqual([baseMsg]);
  });

  it('no-ops text_append on unknown part id', () => {
    const out = applyTextAppend([baseMsg], 'm1', 'pX', '!!');
    expect(out).toEqual([baseMsg]);
  });

  it('appends to a thinking part using the spec `thinking` field', () => {
    const msg: Message = {
      ...baseMsg,
      parts: [{ id: 'p2', type: 'thinking', thinking: 'pondering' }],
    };
    const out = applyTextAppend([msg], 'm1', 'p2', '…');
    expect((out[0]!.parts[0] as { thinking?: string }).thinking).toBe('pondering…');
  });

  it('index-based fallback still works for fixture data', () => {
    const out = applyTextAppendAtIndex([baseMsg], 'm1', 0, ', world');
    expect((out[0]!.parts[0] as { text: string }).text).toBe('Hello, world');
  });

  it('appends a new part', () => {
    const out = appendPart([baseMsg], 'm1', {
      id: 'p2',
      type: 'thinking',
      thinking: 'pondering',
    });
    expect(out[0]!.parts).toHaveLength(2);
    expect(out[0]!.parts[1]!.type).toBe('thinking');
  });

  it('upserts a message by id', () => {
    const replaced: Message = {
      ...baseMsg,
      parts: [{ id: 'p1', type: 'text', text: 'final' }],
    };
    const out = upsertMessage([baseMsg], replaced);
    expect(out).toHaveLength(1);
    expect((out[0]!.parts[0] as { text: string }).text).toBe('final');

    const inserted = upsertMessage([baseMsg], { ...baseMsg, id: 'm2' });
    expect(inserted).toHaveLength(2);
  });
});
