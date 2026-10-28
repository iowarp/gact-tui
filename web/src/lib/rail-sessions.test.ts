import type { Session } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { mergeRailSessions } from './rail-sessions';

const session = (id: string, at: string, overrides: Partial<Session> = {}): Session => ({
  id,
  workspace_id: 'ws_1',
  title: id,
  state: 'completed',
  created_at: at,
  updated_at: at,
  last_interaction_at: at,
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
  ...overrides,
});

describe('mergeRailSessions', () => {
  const paged = [session('b', '2026-08-03'), session('c', '2026-08-02')];

  it('keeps live rows outside the loaded window out while older pages remain', () => {
    const live = [session('old', '2026-07-01'), session('new', '2026-08-09')];
    expect(mergeRailSessions(paged, live, 'ws_1', true).map((row) => row.id)).toEqual([
      'new',
      'b',
      'c',
    ]);
  });

  it('shows every live row once the last page is loaded', () => {
    const live = [session('old', '2026-07-01')];
    expect(mergeRailSessions(paged, live, 'ws_1', false).map((row) => row.id)).toEqual([
      'b',
      'c',
      'old',
    ]);
  });

  it('prefers the live copy of a paged row and moves it by its new interaction time', () => {
    const live = [session('c', '2026-08-05', { title: 'renamed' })];
    const merged = mergeRailSessions(paged, live, 'ws_1', true);
    expect(merged.map((row) => [row.id, row.title])).toEqual([
      ['c', 'renamed'],
      ['b', 'b'],
    ]);
  });

  it('ignores other workspaces and shows live rows before the first page arrives', () => {
    const live = [session('x', '2026-08-01', { workspace_id: 'ws_2' }), session('y', '2026-01-01')];
    expect(mergeRailSessions(undefined, live, 'ws_1', true).map((row) => row.id)).toEqual(['y']);
  });
});
