import { describe, expect, it } from 'vitest';
import { applyTextAppend, appendPart, upsertMessage } from '../src/store/transcript.js';
import type { Message } from '../src/wire/types.js';

const baseMsg: Message = {
  id: 'm1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'Hello' }],
};

describe('transcript store', () => {
  it('applies text_append to matching part', () => {
    const out = applyTextAppend([baseMsg], 'm1', 0, ', world');
    expect((out[0]!.parts[0] as { text: string }).text).toBe('Hello, world');
  });

  it('no-ops text_append on unknown message id', () => {
    const out = applyTextAppend([baseMsg], 'mX', 0, '!!');
    expect(out).toEqual([baseMsg]);
  });

  it('appends a new part', () => {
    const out = appendPart([baseMsg], 'm1', { type: 'thinking', text: 'pondering' });
    expect(out[0]!.parts).toHaveLength(2);
    expect(out[0]!.parts[1]!.type).toBe('thinking');
  });

  it('upserts a message by id', () => {
    const replaced: Message = { ...baseMsg, parts: [{ type: 'text', text: 'final' }] };
    const out = upsertMessage([baseMsg], replaced);
    expect(out).toHaveLength(1);
    expect((out[0]!.parts[0] as { text: string }).text).toBe('final');

    const inserted = upsertMessage([baseMsg], { ...baseMsg, id: 'm2' });
    expect(inserted).toHaveLength(2);
  });
});
