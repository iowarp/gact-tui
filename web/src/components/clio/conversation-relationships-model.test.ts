import type { Session } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { conversationFamily } from './conversation-relationships-model';
import {
  conversationForkOrigin,
  forkAuthorLabel,
  nestAgentForks,
} from './conversation-fork-origin';

const session = (
  id: string,
  parent_session_id?: string,
  session_kind: Session['session_kind'] = 'branch',
  workspace_id = 'workspace',
) => ({ id, parent_session_id, session_kind, workspace_id, created_at: id, title: id }) as Session;

describe('conversation family', () => {
  it('includes ancestors, siblings, nested branches and separately typed delegated work', () => {
    const rows = [
      session('root', undefined, 'conversation'),
      session('a', 'root'),
      session('b', 'root'),
      session('agent', 'a', 'agent'),
      session('lookup', 'agent', 'lookup'),
      session('other'),
      session('outside', 'root', 'branch', 'elsewhere'),
    ];
    const family = conversationFamily(rows, 'a');
    expect(family.sessions.map((row) => row.id)).toEqual(['root', 'a', 'b', 'agent', 'lookup']);
    expect(family.edges).toContainEqual({ source: 'root', target: 'a', kind: 'branch' });
    expect(family.edges).toContainEqual({ source: 'a', target: 'agent', kind: 'delegation' });
    expect(family.incomplete).toBe(false);
  });
  it('reports missing ancestors and cycles without orphan edges or an infinite walk', () => {
    expect(conversationFamily([session('a', 'missing')], 'a').incomplete).toBe(true);
    const family = conversationFamily([session('a', 'b'), session('b', 'a')], 'a');
    expect(family.sessions).toHaveLength(2);
    expect(family.edges).toHaveLength(1);
    expect(family.incomplete).toBe(true);
  });
  it('bounds wide families while retaining the selected ancestry', () => {
    const rows = [
      session('root'),
      ...Array.from({ length: 220 }, (_, i) => session(`${i}`, 'root')),
    ];
    const family = conversationFamily(rows, '219', 20);
    expect(family.sessions.some((row) => row.id === '219')).toBe(true);
    expect(family.sessions.length).toBeLessThanOrEqual(21);
    expect(family.incomplete).toBe(true);
  });
});

describe('saved fork checkpoint', () => {
  const origin = {
    session_id: 'root',
    message_id: 'message',
    message_count: 2,
    title: 'Baseline',
    created_at: '2026-10-11',
  };
  it('reads a durable source checkpoint without the parent transcript', () => {
    expect(
      conversationForkOrigin({ ...session('child', 'root'), metadata: { fork_origin: origin } }),
    ).toEqual(origin);
  });
  it('rejects malformed or foreign origins instead of guessing', () => {
    for (const value of [
      null,
      {},
      { ...origin, session_id: 'other' },
      { ...origin, message_count: 0 },
      { ...origin, message_count: -2 },
      { ...origin, message_count: true },
    ]) {
      expect(
        conversationForkOrigin({ ...session('child', 'root'), metadata: { fork_origin: value } }),
      ).toBeUndefined();
    }
  });
});

describe('agent fork origin', () => {
  const origin = {
    session_id: 'root',
    message_id: 'message',
    message_count: 2,
    title: 'Baseline',
    created_at: '2026-10-11',
    author: { kind: 'agent', agent_id: 'clio/standard' },
    invocation: 'call_000000000001',
    note: 'pursue H4 instead',
  };
  const fork = { ...session('fork', 'root'), metadata: { fork_origin: origin } } as Session;

  it('names the agent as author with its note', () => {
    expect(conversationForkOrigin(fork)).toMatchObject({
      author: { kind: 'agent', agent_id: 'clio/standard' },
      note: 'pursue H4 instead',
      invocation: 'call_000000000001',
    });
    expect(forkAuthorLabel(conversationForkOrigin(fork))).toBe(
      'Forked by the agent: pursue H4 instead',
    );
    const person = { ...origin, author: { kind: 'human' } };
    expect(
      forkAuthorLabel(
        conversationForkOrigin({ ...session('b', 'root'), metadata: { fork_origin: person } }),
      ),
    ).toBeUndefined();
  });

  it('lists an agent fork under its origin', () => {
    const rows = nestAgentForks([
      fork,
      session('other', undefined, 'conversation'),
      session('root', undefined, 'conversation'),
    ]);
    expect(rows.map((row) => [row.session.id, row.depth])).toEqual([
      ['other', 0],
      ['root', 0],
      ['fork', 1],
    ]);
  });
});
