import { describe, expect, it } from 'vitest';
import {
  applyTextAppend,
  appendPart,
  mergeMessages,
  prependOlderPage,
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

describe('mergeMessages (reconcile race)', () => {
  it('preserves an in-flight text-append that raced a stale reconcile', () => {
    // Local feed got a `message.part.delta` (Hello, world) while the
    // `/v1/messages` reconcile fetch was in flight; the snapshot is stale.
    const local: Message[] = [
      { id: 'm1', role: 'assistant', parts: [{ id: 'p1', type: 'text', text: 'Hello, world' }] },
    ];
    const reconciled: Message[] = [
      { id: 'm1', role: 'assistant', parts: [{ id: 'p1', type: 'text', text: 'Hello' }] },
    ];
    const out = mergeMessages(local, reconciled);
    // The longer (newer) local text wins, not the stale snapshot.
    expect((out[0]!.parts[0] as { text: string }).text).toBe('Hello, world');
  });

  it('keeps a local-only message the snapshot has not caught up to', () => {
    const local: Message[] = [
      { id: 'm1', role: 'user', parts: [{ id: 'p1', type: 'text', text: 'hi' }] },
      { id: 'm2', role: 'assistant', parts: [{ id: 'p2', type: 'text', text: 'streaming…' }] },
    ];
    // Reconcile only returned the first message (m2 created mid-fetch).
    const reconciled: Message[] = [
      { id: 'm1', role: 'user', parts: [{ id: 'p1', type: 'text', text: 'hi' }] },
    ];
    const out = mergeMessages(local, reconciled);
    expect(out.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect((out[1]!.parts[0] as { text: string }).text).toBe('streaming…');
  });

  it('keeps a local-only part appended during the fetch', () => {
    const local: Message[] = [
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          { id: 'p1', type: 'text', text: 'done' },
          { id: 'p2', type: 'text', text: 'newer part' },
        ],
      },
    ];
    const reconciled: Message[] = [
      { id: 'm1', role: 'assistant', parts: [{ id: 'p1', type: 'text', text: 'done' }] },
    ];
    const out = mergeMessages(local, reconciled);
    expect(out[0]!.parts.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('lets the reconciled snapshot win for finalised non-text fields', () => {
    const local: Message[] = [
      { id: 'm1', role: 'assistant', parts: [{ id: 'p1', type: 'text', text: 'answer' }] },
    ];
    const reconciled: Message[] = [
      {
        id: 'm1',
        role: 'assistant',
        parts: [{ id: 'p1', type: 'text', text: 'answer' }],
        stop_reason: 'end_turn',
        cost_usd: 0.0021,
      },
    ];
    const out = mergeMessages(local, reconciled);
    expect(out[0]!.stop_reason).toBe('end_turn');
    expect(out[0]!.cost_usd).toBe(0.0021);
  });

  it('respects the reconciled ordering and drops deleted messages absent locally', () => {
    const local: Message[] = [
      { id: 'm1', role: 'user', parts: [] },
      { id: 'm2', role: 'assistant', parts: [] },
    ];
    // Server reordered + dropped m1 (e.g. message.deleted reconcile).
    const reconciled: Message[] = [{ id: 'm2', role: 'assistant', parts: [] }];
    const out = mergeMessages(local, reconciled);
    // Reconciled is authoritative for what it returns; m1 stays as local-only
    // (it was not deleted from the local feed, only absent from the snapshot).
    expect(out.map((m) => m.id)).toEqual(['m2', 'm1']);
  });

  it('does not mutate its inputs', () => {
    const local: Message[] = [
      { id: 'm1', role: 'assistant', parts: [{ id: 'p1', type: 'text', text: 'Hi there' }] },
    ];
    const reconciled: Message[] = [
      { id: 'm1', role: 'assistant', parts: [{ id: 'p1', type: 'text', text: 'Hi' }] },
    ];
    const localCopy = structuredClone(local);
    const reconciledCopy = structuredClone(reconciled);
    mergeMessages(local, reconciled);
    expect(local).toEqual(localCopy);
    expect(reconciled).toEqual(reconciledCopy);
  });
});

describe('prependOlderPage (progressive transcript backfill)', () => {
  const m = (id: string): Message => ({ id, role: 'user', parts: [{ id: `${id}p`, type: 'text', text: id }] });

  it('prepends an older page ahead of the currently loaded feed', () => {
    const current = [m('m3'), m('m4')];
    const older = [m('m1'), m('m2')];
    const out = prependOlderPage(current, older);
    expect(out.map((x) => x.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('de-dupes a message present on both sides, keeping the current feed copy', () => {
    const current = [
      { id: 'm2', role: 'assistant', parts: [{ id: 'p', type: 'text', text: 'live-merged' }] } as Message,
      m('m3'),
    ];
    // The older-page fetch raced a reconcile that already folded m2 in.
    const older = [m('m1'), m('m2')];
    const out = prependOlderPage(current, older);
    expect(out.map((x) => x.id)).toEqual(['m1', 'm2', 'm3']);
    // current's copy of m2 wins, not the older page's.
    expect((out[1]!.parts[0] as { text: string }).text).toBe('live-merged');
  });

  it('returns the SAME array reference when the older page has nothing new', () => {
    const current = [m('m1'), m('m2')];
    const out = prependOlderPage(current, [m('m1')]);
    expect(out).toBe(current);
  });

  it('does not mutate its inputs', () => {
    const current = [m('m3')];
    const older = [m('m1'), m('m2')];
    const currentCopy = structuredClone(current);
    const olderCopy = structuredClone(older);
    prependOlderPage(current, older);
    expect(current).toEqual(currentCopy);
    expect(older).toEqual(olderCopy);
  });

  it('handles an empty current feed (first backfill page on a fresh load)', () => {
    const out = prependOlderPage([], [m('m1'), m('m2')]);
    expect(out.map((x) => x.id)).toEqual(['m1', 'm2']);
  });
});
