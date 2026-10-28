import type { Session } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { mergeKnownSessions } from './use-known-sessions';

const session = (id: string, title: string): Session => ({
  id,
  workspace_id: 'ws_1',
  title,
  state: 'completed',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
});

describe('mergeKnownSessions', () => {
  it('is unknown until either set answers', () => {
    expect(mergeKnownSessions(undefined, undefined)).toBeUndefined();
    expect(mergeKnownSessions(undefined, [])).toEqual([]);
  });

  it('keeps one row per session and prefers the family copy', () => {
    const merged = mergeKnownSessions(
      [session('a', 'family copy'), session('b', 'child')],
      [session('a', 'waiting copy'), session('c', 'elsewhere')],
    );
    expect(merged?.map((row) => [row.id, row.title])).toEqual([
      ['a', 'family copy'],
      ['c', 'elsewhere'],
      ['b', 'child'],
    ]);
  });
});
