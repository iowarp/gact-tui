/**
 * The timeline log's git-branch tree model (viz rebuild, 2026-08).
 *
 * Owner direction: the depth rail should read "more like a git branch tree" —
 * a distinct colour per agent with fork/merge elbows at the spawn and return
 * rows. These pin the column bookkeeping that makes that possible, and the one
 * cross-surface guarantee: an agent draws in the SAME colour here and in the
 * gantt.
 */
import { describe, expect, it } from 'vitest';
import { branchColor } from '../../src/observability/ganttModel';
import { buildLogTree } from '../../src/observability/logTreeModel';
import type { ObsTimelineRow } from '../../src/observability/types';

const row = (over: Partial<ObsTimelineRow> & Pick<ObsTimelineRow, 'actor'>): ObsTimelineRow => ({
  action: 'x',
  kind: 'event',
  depth: 0,
  ...over,
});

/** main opens a child, the child works, the child returns. */
const SPAWN_AND_RETURN: ObsTimelineRow[] = [
  row({ actor: 'user', kind: 'user', agent: 'main' }),
  row({ actor: 'ndp #1', kind: 'running', branch: 'open', agent: 'main' }),
  row({ actor: 'ndp_search', kind: 'tool', depth: 1, agent: 'ndp #1' }),
  row({ actor: 'ndp #1', kind: 'event', branch: 'close', agent: 'main' }),
  row({ actor: 'turn.completed', kind: 'event', agent: 'main' }),
];

describe('buildLogTree — rails per open branch', () => {
  it('draws one rail per OCCUPIED column, main always present', () => {
    const tree = buildLogTree(SPAWN_AND_RETURN);
    // The spawn row draws main only (its elbow starts the child); the child's
    // own row draws both; the return row has already popped the child.
    expect(tree.map((entry) => entry.rails.length)).toEqual([1, 1, 2, 1, 1]);
    expect(tree[0]!.rails[0]!.branch).toBe('main');
    expect(tree[2]!.rails.map((rail) => rail.branch)).toEqual(['main', 'ndp #1']);
  });

  it('keeps an open branch\'s rail CONTINUOUS through rows another agent logged', () => {
    // main spawns A, then logs its own row, then spawns B: A's column must
    // still be drawn on main's row and on B's spawn row.
    const rows: ObsTimelineRow[] = [
      row({ actor: 'A', kind: 'running', branch: 'open', agent: 'main' }),
      row({ actor: 'a_tool', kind: 'tool', depth: 1, agent: 'agent A' }),
      row({ actor: 'routing', kind: 'event', agent: 'main' }),
      row({ actor: 'B', kind: 'running', branch: 'open', agent: 'main' }),
      row({ actor: 'b_tool', kind: 'tool', depth: 1, agent: 'agent B' }),
    ];
    const tree = buildLogTree(rows);
    expect(tree[2]!.rails.map((rail) => rail.branch)).toEqual(['main', 'agent A']);
    expect(tree[3]!.rails.map((rail) => rail.branch)).toEqual(['main', 'agent A']);
  });

  it('gives two CONCURRENT siblings two columns instead of colliding on their shared depth', () => {
    const rows: ObsTimelineRow[] = [
      row({ actor: 'A', kind: 'running', branch: 'open', agent: 'main' }),
      row({ actor: 'a_tool', kind: 'tool', depth: 1, agent: 'agent A' }),
      row({ actor: 'B', kind: 'running', branch: 'open', agent: 'main' }),
      row({ actor: 'b_tool', kind: 'tool', depth: 1, agent: 'agent B' }),
      row({ actor: 'a_tool2', kind: 'tool', depth: 1, agent: 'agent A' }),
    ];
    const tree = buildLogTree(rows);
    // Both children are at depth 1, but they hold DIFFERENT columns…
    expect(tree[1]!.nodeColumn).toBe(1);
    expect(tree[3]!.nodeColumn).toBe(2);
    // …and agent A keeps its own column when it logs again.
    expect(tree[4]!.nodeColumn).toBe(1);
    // Three rails once both are open.
    expect(tree[3]!.rails.map((rail) => rail.branch)).toEqual(['main', 'agent A', 'agent B']);
    // The second spawn's elbow reaches PAST the sibling's column.
    expect(tree[2]!.elbow).toMatchObject({ edge: 'open', column: 0, span: 2 });
  });

  it('frees a returning branch\'s column for the next spawn to reuse', () => {
    const rows: ObsTimelineRow[] = [
      row({ actor: 'agent A', kind: 'running', branch: 'open', agent: 'main' }),
      row({ actor: 'a_tool', kind: 'tool', depth: 1, agent: 'agent A' }),
      row({ actor: 'agent A', kind: 'event', branch: 'close', agent: 'main' }),
      row({ actor: 'agent B', kind: 'running', branch: 'open', agent: 'main' }),
      row({ actor: 'b_tool', kind: 'tool', depth: 1, agent: 'agent B' }),
    ];
    const tree = buildLogTree(rows);
    expect(tree[1]!.nodeColumn).toBe(1);
    expect(tree[2]!.rails).toHaveLength(1);
    expect(tree[4]!.nodeColumn).toBe(1);
    expect(tree[4]!.rails.map((rail) => rail.branch)).toEqual(['main', 'agent B']);
  });

  it('colours each rail by the AGENT holding that column, not by its index', () => {
    const tree = buildLogTree(SPAWN_AND_RETURN);
    expect(tree[2]!.rails[0]!.color).toBe(branchColor('main'));
    expect(tree[2]!.rails[1]!.color).toBe(branchColor('ndp #1'));
    expect(tree[2]!.rails[1]!.color).not.toBe(tree[2]!.rails[0]!.color);
  });

  it('is the SAME colour the gantt gives that agent — one agent, one colour in the layer', () => {
    const tree = buildLogTree(SPAWN_AND_RETURN);
    expect(tree[2]!.rails[1]!.color).toBe(branchColor('ndp #1'));
    expect(tree[0]!.rails[0]!.color).toBe(branchColor('main'));
  });
});

describe('buildLogTree — fork and merge elbows', () => {
  it('puts a fork elbow on the spawn row, in the CHILD branch\'s colour', () => {
    const tree = buildLogTree(SPAWN_AND_RETURN);
    expect(tree[1]!.elbow).toEqual({
      edge: 'open',
      column: 0,
      span: 1,
      branch: 'ndp #1',
      color: branchColor('ndp #1'),
    });
  });

  it('puts a merge elbow on the return row, in the same child colour', () => {
    const tree = buildLogTree(SPAWN_AND_RETURN);
    expect(tree[3]!.elbow?.edge).toBe('close');
    expect(tree[3]!.elbow?.color).toBe(branchColor('ndp #1'));
  });

  it('draws no elbow on an ordinary row', () => {
    const tree = buildLogTree(SPAWN_AND_RETURN);
    expect(tree[0]!.elbow).toBeUndefined();
    expect(tree[2]!.elbow).toBeUndefined();
    expect(tree[4]!.elbow).toBeUndefined();
  });

  it('names the fork after the CHILD\'s own agent label, not the delegation actor\'s spelling', () => {
    // The delegation event says `expert_id`; the child's own rows say the
    // agent-task run label. One agent must not draw two colours.
    const rows: ObsTimelineRow[] = [
      row({ actor: 'ndp_expert', kind: 'running', branch: 'open', agent: 'main' }),
      row({ actor: 'ndp_search', kind: 'tool', depth: 1, agent: 'ndp #1' }),
      row({ actor: 'ndp_expert', kind: 'event', branch: 'close', agent: 'main' }),
    ];
    const tree = buildLogTree(rows);
    expect(tree[0]!.elbow?.branch).toBe('ndp #1');
    expect(tree[0]!.elbow?.color).toBe(tree[1]!.rails[1]!.color);
  });
});

describe('buildLogTree — column reuse', () => {
  it('a column reused by a DIFFERENT agent takes the new agent\'s colour, never the old one\'s', () => {
    const rows: ObsTimelineRow[] = [
      row({ actor: 'a', kind: 'running', branch: 'open', agent: 'main' }),
      row({ actor: 'tool_a', kind: 'tool', depth: 1, agent: 'agent A' }),
      row({ actor: 'a', kind: 'event', branch: 'close', agent: 'main' }),
      row({ actor: 'b', kind: 'running', branch: 'open', agent: 'main' }),
      row({ actor: 'tool_b', kind: 'tool', depth: 1, agent: 'agent B' }),
    ];
    const tree = buildLogTree(rows);
    expect(tree[1]!.rails[1]!.branch).toBe('agent A');
    expect(tree[4]!.rails[1]!.branch).toBe('agent B');
    expect(tree[4]!.rails[1]!.color).not.toBe(tree[1]!.rails[1]!.color);
  });

  it('handles concurrent siblings at the same depth by re-reading each row\'s own agent', () => {
    const rows: ObsTimelineRow[] = [
      row({ actor: 'x', kind: 'running', branch: 'open', agent: 'main' }),
      row({ actor: 'tool1', kind: 'tool', depth: 1, agent: 'ndp #1' }),
      row({ actor: 'tool2', kind: 'tool', depth: 1, agent: 'ndp #2' }),
      row({ actor: 'tool3', kind: 'tool', depth: 1, agent: 'ndp #1' }),
    ];
    const tree = buildLogTree(rows);
    expect(tree[1]!.nodeColor).toBe(branchColor('ndp #1'));
    expect(tree[2]!.nodeColor).toBe(branchColor('ndp #2'));
    expect(tree[3]!.nodeColor).toBe(branchColor('ndp #1'));
  });
});

describe('buildLogTree — degraded input', () => {
  it('falls back to main for rows carrying no agent fact (pre-P5 fixtures)', () => {
    const tree = buildLogTree([row({ actor: 'anything' })]);
    expect(tree[0]!.rails).toEqual([{ column: 0, branch: 'main', color: branchColor('main') }]);
    expect(tree[0]!.nodeBranch).toBe('main');
  });

  it('falls back to depth-as-column when no row names its agent — the pre-existing behaviour', () => {
    const tree = buildLogTree([
      row({ actor: 'geo_geocode', kind: 'tool', depth: 1 }),
      row({ actor: 'geospatial', kind: 'event', depth: 0, branch: 'close' }),
    ]);
    expect(tree[0]!.rails.map((rail) => rail.column)).toEqual([0, 1]);
    expect(tree[0]!.nodeColumn).toBe(1);
    expect(tree[1]!.rails.map((rail) => rail.column)).toEqual([0]);
    expect(tree[1]!.elbow).toMatchObject({ edge: 'close', column: 0, span: 1 });
  });

  it('returns one entry per row, always — the renderer indexes it positionally', () => {
    expect(buildLogTree([])).toEqual([]);
    expect(buildLogTree(SPAWN_AND_RETURN)).toHaveLength(SPAWN_AND_RETURN.length);
  });

  it('never crashes on a close with no matching open', () => {
    const tree = buildLogTree([row({ actor: 'orphan', branch: 'close', depth: 0, agent: 'main' })]);
    expect(tree[0]!.rails).toHaveLength(1);
    expect(tree[0]!.elbow?.edge).toBe('close');
  });
});
