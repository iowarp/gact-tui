/**
 * `applyMessageLifecycleEvent`'s typed result (gact-tui#364 client-half
 * deliverable): before this, an event naming an unknown message/part id and
 * a real application were indistinguishable no-ops (both produced a
 * non-null array). These pin the three-way split — applied vs
 * unapplied_unknown_id vs irrelevant — so a caller can treat "unknown id"
 * as an honest divergence signal instead of a silent guess.
 */
import type { Message, SessionMessageEvent } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { applyMessageLifecycleEvent } from '../../src/session/messageEvents';

function msg(id: string, parts: Message['parts'] = []): Message {
  return { id, role: 'assistant', parts };
}

function evt(type: SessionMessageEvent['type'], payload: Record<string, unknown>): SessionMessageEvent {
  return { type, occurred_at: '2026-08-14T00:00:00Z', payload };
}

describe('applyMessageLifecycleEvent — unknown-id divergence signal (gact-tui#364)', () => {
  it('reports unapplied_unknown_id for message.part.added against an unknown message_id', () => {
    const messages = [msg('m1')];
    const result = applyMessageLifecycleEvent(
      messages,
      evt('message.part.added', {
        message_id: 'm_does_not_exist',
        part: { type: 'text', id: 'p1', text: 'hi' },
      }),
    );
    expect(result).toEqual({ kind: 'unapplied_unknown_id' });
  });

  it('reports unapplied_unknown_id for message.part.updated against an unknown message_id', () => {
    const messages = [msg('m1')];
    const result = applyMessageLifecycleEvent(
      messages,
      evt('message.part.updated', {
        message_id: 'm_does_not_exist',
        part: { type: 'text', id: 'p1', text: 'hi' },
      }),
    );
    expect(result).toEqual({ kind: 'unapplied_unknown_id' });
  });

  it('reports unapplied_unknown_id for message.part.delta against a known message but unknown part_id', () => {
    const messages = [msg('m1', [{ type: 'text', id: 'p_real', text: 'hello' } as Message['parts'][number]])];
    const result = applyMessageLifecycleEvent(
      messages,
      evt('message.part.delta', {
        message_id: 'm1',
        part_id: 'p_does_not_exist',
        delta: { text_append: ' world' },
      }),
    );
    expect(result).toEqual({ kind: 'unapplied_unknown_id' });
  });

  it('reports unapplied_unknown_id for message.part.delta against an unknown message_id too', () => {
    const messages = [msg('m1')];
    const result = applyMessageLifecycleEvent(
      messages,
      evt('message.part.delta', {
        message_id: 'm_does_not_exist',
        part_id: 'p1',
        delta: { text_append: 'x' },
      }),
    );
    expect(result).toEqual({ kind: 'unapplied_unknown_id' });
  });

  it('reports unapplied_unknown_id for message.part.completed against a known message but unknown part_id', () => {
    const messages = [msg('m1', [{ type: 'text', id: 'p_real', text: 'hello' } as Message['parts'][number]])];
    const result = applyMessageLifecycleEvent(
      messages,
      evt('message.part.completed', {
        message_id: 'm1',
        part_id: 'p_does_not_exist',
        final_text: 'final',
      }),
    );
    expect(result).toEqual({ kind: 'unapplied_unknown_id' });
  });

  it('never mutates the input array when reporting unapplied_unknown_id', () => {
    const messages = [msg('m1')];
    const snapshot = JSON.stringify(messages);
    applyMessageLifecycleEvent(
      messages,
      evt('message.part.added', { message_id: 'm_ghost', part: { type: 'text', id: 'p1', text: 'x' } }),
    );
    expect(JSON.stringify(messages)).toBe(snapshot);
  });
});

describe('applyMessageLifecycleEvent — applied (known ids)', () => {
  it('applies message.part.added onto a known message, appending the part', () => {
    const messages = [msg('m1')];
    const part = { type: 'text', id: 'p1', text: 'hi' } as Message['parts'][number];
    const result = applyMessageLifecycleEvent(messages, evt('message.part.added', { message_id: 'm1', part }));
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') throw new Error('unreachable');
    expect(result.messages[0]!.parts).toEqual([part]);
  });

  it('applies message.part.updated onto a known message, replacing the part by id (in-place settle)', () => {
    const messages = [msg('m1', [{ type: 'text', id: 'p1', text: 'draft' } as Message['parts'][number]])];
    const updated = { type: 'text', id: 'p1', text: 'final' } as Message['parts'][number];
    const result = applyMessageLifecycleEvent(
      messages,
      evt('message.part.updated', { message_id: 'm1', part: updated }),
    );
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') throw new Error('unreachable');
    expect(result.messages[0]!.parts).toEqual([updated]);
  });

  it('applies message.part.delta onto a known part, appending text', () => {
    const messages = [msg('m1', [{ type: 'text', id: 'p1', text: 'hello' } as Message['parts'][number]])];
    const result = applyMessageLifecycleEvent(
      messages,
      evt('message.part.delta', { message_id: 'm1', part_id: 'p1', delta: { text_append: ' world' } }),
    );
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') throw new Error('unreachable');
    expect((result.messages[0]!.parts[0] as { text?: string }).text).toBe('hello world');
  });

  it('applies message.part.completed onto a known part, replacing its text with final_text', () => {
    const messages = [msg('m1', [{ type: 'text', id: 'p1', text: 'stream in progress' } as Message['parts'][number]])];
    const result = applyMessageLifecycleEvent(
      messages,
      evt('message.part.completed', { message_id: 'm1', part_id: 'p1', final_text: 'the final text' }),
    );
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') throw new Error('unreachable');
    expect((result.messages[0]!.parts[0] as { text?: string }).text).toBe('the final text');
  });

  it('applies message.created for a brand-new message id (upsert-insert)', () => {
    const messages: Message[] = [];
    const result = applyMessageLifecycleEvent(
      messages,
      evt('message.created', { id: 'm_new', role: 'user', parts: [{ type: 'text', id: 'p1', text: 'hi' }] }),
    );
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') throw new Error('unreachable');
    expect(result.messages.map((m) => m.id)).toEqual(['m_new']);
  });

  it('applies message.created for an existing message id (upsert-replace)', () => {
    const messages = [msg('m1', [{ type: 'text', id: 'p_old', text: 'old' } as Message['parts'][number]])];
    const result = applyMessageLifecycleEvent(
      messages,
      evt('message.created', { id: 'm1', role: 'assistant', parts: [{ type: 'text', id: 'p_new', text: 'new' }] }),
    );
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') throw new Error('unreachable');
    expect(result.messages[0]!.parts).toEqual([{ type: 'text', id: 'p_new', text: 'new' }]);
  });

  it('reports applied (unchanged) when a replay resends an empty shell over a locally richer message', () => {
    // Owner capture round 5: a historical empty shell must never clobber
    // richer local state — but the message id IS known, so this is a
    // deliberate no-clobber decision, not a divergence signal.
    const messages = [msg('m1', [{ type: 'text', id: 'p1', text: 'rich local content' } as Message['parts'][number]])];
    const result = applyMessageLifecycleEvent(
      messages,
      evt('message.created', { id: 'm1', role: 'assistant', parts: [] }),
    );
    expect(result).toEqual({ kind: 'applied', messages });
  });
});

describe('applyMessageLifecycleEvent — irrelevant (reconcile-class + malformed)', () => {
  it.each(['message.completed', 'message.error', 'message.deleted'] as const)(
    'reports irrelevant for reconcile-class event %s',
    (type) => {
      const result = applyMessageLifecycleEvent([msg('m1')], evt(type, {}));
      expect(result).toEqual({ kind: 'irrelevant' });
    },
  );

  it('reports irrelevant for a malformed message.created payload (no id/role, no nested message)', () => {
    const result = applyMessageLifecycleEvent([msg('m1')], evt('message.created', { garbage: true }));
    expect(result).toEqual({ kind: 'irrelevant' });
  });

  it('reports irrelevant for message.part.added missing message_id', () => {
    const result = applyMessageLifecycleEvent(
      [msg('m1')],
      evt('message.part.added', { part: { type: 'text', id: 'p1', text: 'x' } }),
    );
    expect(result).toEqual({ kind: 'irrelevant' });
  });

  it('reports irrelevant for message.part.added missing part', () => {
    const result = applyMessageLifecycleEvent([msg('m1')], evt('message.part.added', { message_id: 'm1' }));
    expect(result).toEqual({ kind: 'irrelevant' });
  });

  it('reports irrelevant for message.part.delta with no text_append', () => {
    const messages = [msg('m1', [{ type: 'text', id: 'p1', text: 'hi' } as Message['parts'][number]])];
    const result = applyMessageLifecycleEvent(
      messages,
      evt('message.part.delta', { message_id: 'm1', part_id: 'p1', delta: {} }),
    );
    expect(result).toEqual({ kind: 'irrelevant' });
  });

  it('reports irrelevant for message.part.completed with a non-string final_text', () => {
    const messages = [msg('m1', [{ type: 'text', id: 'p1', text: 'hi' } as Message['parts'][number]])];
    const result = applyMessageLifecycleEvent(
      messages,
      evt('message.part.completed', { message_id: 'm1', part_id: 'p1', final_text: 42 }),
    );
    expect(result).toEqual({ kind: 'irrelevant' });
  });
});
