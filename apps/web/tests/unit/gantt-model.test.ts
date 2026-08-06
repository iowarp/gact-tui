/**
 * The gantt's data → lane model (viz rebuild, 2026-08).
 *
 * The owner finding this replaces: "fanout branches OVERLAP in the gantt
 * instead of getting distinct lanes/colors". These tests pin the two properties
 * that finding demands, as PROPERTIES of the model rather than as pixel
 * snapshots — a lane must never hold two spans whose real time windows
 * intersect, and a branch's colour must not depend on anything but the branch.
 */
import { describe, expect, it } from 'vitest';
import {
  assignLanes,
  barGeometry,
  branchColor,
  branchKey,
  assignBranchColors,
  BRANCH_PALETTE,
  fullExtent,
  percentIn,
} from '../../src/observability/ganttModel';
import type { ObsSpan } from '../../src/observability/types';

const span = (over: Partial<ObsSpan> & Pick<ObsSpan, 'id' | 'label' | 'startMs'>): ObsSpan => ({
  depth: 1,
  endMs: over.startMs + 1_000,
  state: 'done',
  ...over,
});

describe('branchKey — which agent a span belongs to', () => {
  it('folds a main agent\'s consecutive turns onto one branch', () => {
    expect(branchKey(span({ id: 't1', label: 'main · turn 1', startMs: 0 }))).toBe('main');
    expect(branchKey(span({ id: 't2', label: 'main · turn 2', startMs: 9 }))).toBe('main');
  });

  it('gives a child agent its own branch, keyed by its real run label', () => {
    expect(branchKey(span({ id: 'a', label: 'ndp #1', startMs: 0 }))).toBe('ndp #1');
    expect(branchKey(span({ id: 'b', label: 'ndp #2', startMs: 0 }))).toBe('ndp #2');
  });

  it('rides the root session\'s own tool calls on main, not on a lane each', () => {
    expect(branchKey(span({ id: 'x', label: 'spawn_agents_parallel', startMs: 0, tool: true }))).toBe(
      'main',
    );
    expect(branchKey(span({ id: 'y', label: 'wait_agent_tasks', startMs: 0, tool: true }))).toBe('main');
  });

  it('falls back to the span id rather than an empty key', () => {
    expect(branchKey(span({ id: 'sp9', label: '   ', startMs: 0 }))).toBe('sp9');
  });
});

describe('branchColor — stable per agent', () => {
  it('pins main to the app teal so the primary agent never changes colour', () => {
    expect(branchColor('main')).toBe(BRANCH_PALETTE[0]);
    expect(branchColor('main')).toBe('#0aa6ad');
  });

  it('gives the same branch the same colour regardless of what else exists', () => {
    const first = branchColor('geospatial');
    expect(branchColor('geospatial')).toBe(first);
    // Colour is a pure function of the key: assigning other branches in between
    // cannot move it (a positional palette would fail this).
    branchColor('data');
    branchColor('zzz');
    expect(branchColor('geospatial')).toBe(first);
  });

  it('never hands a non-main branch main\'s teal', () => {
    for (const key of ['data', 'geospatial', 'ndp #1', 'ndp #2', 'analysis', 'plot', 'x', 'q']) {
      expect(branchColor(key)).not.toBe(BRANCH_PALETTE[0]);
      expect(BRANCH_PALETTE).toContain(branchColor(key));
    }
  });

  it('is independent of arrival order for a whole set of agents', () => {
    const keys = ['ndp #1', 'ndp #2', 'ndp #3', 'geospatial'];
    const forward = keys.map(branchColor);
    const backward = [...keys].reverse().map(branchColor).reverse();
    expect(backward).toEqual(forward);
  });
});

describe('assignBranchColors — distinct within one view', () => {
  it('never gives two branches the same colour while palette slots remain', () => {
    // A bare hash over six slots really does collide on ordinary run labels —
    // `ndp #2`/`geospatial #1` and `ndp #1`/`report #1` are two such pairs, and
    // drawing two concurrent agents in one colour is the exact failure this
    // whole palette exists to prevent.
    expect(branchColor('ndp #2')).toBe(branchColor('geospatial #1'));
    expect(branchColor('ndp #1')).toBe(branchColor('report #1'));
    const palette = assignBranchColors([
      'main',
      'ndp #1',
      'ndp #2',
      'geospatial #1',
      'plot #1',
      'report #1',
    ]);
    const colors = [...palette.values()];
    expect(new Set(colors).size).toBe(colors.length);
    expect(palette.get('main')).toBe(BRANCH_PALETTE[0]);
  });

  it('keeps main on the teal and hands it to nobody else', () => {
    const palette = assignBranchColors(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'main']);
    expect(palette.get('main')).toBe(BRANCH_PALETTE[0]);
    for (const [key, color] of palette) {
      if (key !== 'main') expect(color).not.toBe(BRANCH_PALETTE[0]);
    }
  });

  it('is independent of arrival order — the same agents always get the same map', () => {
    const keys = ['ndp #1', 'geospatial #1', 'plot #1', 'main'];
    const forward = assignBranchColors(keys);
    const backward = assignBranchColors([...keys].reverse());
    for (const key of keys) expect(backward.get(key)).toBe(forward.get(key));
  });

  it('keeps assigning past the palette size instead of dropping branches', () => {
    const keys = Array.from({ length: 20 }, (_, i) => `agent ${i}`);
    const palette = assignBranchColors(keys);
    expect(palette.size).toBe(21); // 20 + main
    for (const key of keys) expect(BRANCH_PALETTE).toContain(palette.get(key));
  });
});

describe('assignLanes — the no-overlap invariant', () => {
  /** Every pair of spans on one lane must have disjoint time windows. */
  const assertNoOverlapWithinLanes = (spans: ObsSpan[]) => {
    for (const lane of assignLanes(spans)) {
      for (const a of lane.spans) {
        for (const b of lane.spans) {
          if (a === b) continue;
          const aEnd = a.endMs ?? Number.POSITIVE_INFINITY;
          const bEnd = b.endMs ?? Number.POSITIVE_INFINITY;
          const overlaps = a.startMs < bEnd && b.startMs < aEnd;
          expect(
            overlaps,
            `lane ${lane.id} holds overlapping spans ${a.id} and ${b.id}`,
          ).toBe(false);
        }
      }
    }
  };

  it('puts concurrent fanout siblings on separate lanes', () => {
    const lanes = assignLanes([
      span({ id: 'c1', label: 'ndp #1', startMs: 1_000, endMs: 9_000 }),
      span({ id: 'c2', label: 'ndp #2', startMs: 1_100, endMs: 9_500 }),
      span({ id: 'c3', label: 'ndp #3', startMs: 1_200, endMs: 8_000 }),
    ]);
    expect(lanes).toHaveLength(3);
    expect(new Set(lanes.map((lane) => lane.color)).size).toBe(3);
    assertNoOverlapWithinLanes([
      span({ id: 'c1', label: 'ndp #1', startMs: 1_000, endMs: 9_000 }),
      span({ id: 'c2', label: 'ndp #2', startMs: 1_100, endMs: 9_500 }),
      span({ id: 'c3', label: 'ndp #3', startMs: 1_200, endMs: 8_000 }),
    ]);
  });

  it('shares ONE lane for the same agent\'s sequential, non-overlapping spans', () => {
    const lanes = assignLanes([
      span({ id: 't1', label: 'main · turn 1', startMs: 0, endMs: 5_000, depth: 0 }),
      span({ id: 't2', label: 'main · turn 2', startMs: 7_000, endMs: 9_000, depth: 0 }),
    ]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.spans.map((s) => s.id)).toEqual(['t1', 't2']);
    expect(lanes[0]!.label).toBe('main');
  });

  it('splits ONE branch into sub-lanes when its own spans overlap (main\'s nested tool calls)', () => {
    const spans = [
      span({ id: 't1', label: 'main · turn 1', startMs: 0, endMs: 10_000, depth: 0 }),
      span({ id: 'k1', label: 'spawn_agents_parallel', startMs: 1_000, endMs: 2_000, tool: true }),
      span({ id: 'k2', label: 'wait_agent_tasks', startMs: 1_500, endMs: 8_000, tool: true }),
    ];
    const lanes = assignLanes(spans);
    // One branch (main), three overlapping spans ⇒ three lanes.
    expect(lanes.every((lane) => lane.branch === 'main')).toBe(true);
    expect(lanes).toHaveLength(3);
    expect(lanes.map((lane) => lane.laneIndex)).toEqual([0, 1, 2]);
    assertNoOverlapWithinLanes(spans);
  });

  it('never lets a RUNNING span (no end) share a lane with anything after it', () => {
    const spans = [
      span({ id: 'r', label: 'main · turn 3', startMs: 1_000, endMs: null, state: 'running', depth: 0 }),
      span({ id: 'k', label: 'spawn_agent_task', startMs: 2_000, endMs: 3_000, tool: true }),
    ];
    const lanes = assignLanes(spans);
    expect(lanes).toHaveLength(2);
    assertNoOverlapWithinLanes(spans);
  });

  it('orders lanes chronologically by each branch\'s first start', () => {
    const lanes = assignLanes([
      span({ id: 'c', label: 'later', startMs: 5_000 }),
      span({ id: 'a', label: 'first', startMs: 100 }),
      span({ id: 'b', label: 'middle', startMs: 900 }),
    ]);
    expect(lanes.map((lane) => lane.branch)).toEqual(['first', 'middle', 'later']);
  });

  it('labels a single-span lane with that span\'s own name, a shared lane with the branch', () => {
    const lanes = assignLanes([
      span({ id: 't1', label: 'main · turn 1', startMs: 0, endMs: 100, depth: 0 }),
      span({ id: 't2', label: 'main · turn 2', startMs: 200, endMs: 300, depth: 0 }),
      span({ id: 'g', label: 'geospatial', startMs: 10, endMs: 90 }),
    ]);
    expect(lanes.find((lane) => lane.branch === 'main')!.label).toBe('main');
    expect(lanes.find((lane) => lane.branch === 'geospatial')!.label).toBe('geospatial');
  });

  it('handles an empty span list without throwing', () => {
    expect(assignLanes([])).toEqual([]);
  });
});

describe('fullExtent + geometry', () => {
  it('extends the window to now while a span is still running', () => {
    const now = 50_000;
    const extent = fullExtent(
      [span({ id: 'r', label: 'a', startMs: 1_000, endMs: null, state: 'running' })],
      now,
    );
    expect(extent.min).toBe(1_000);
    expect(extent.max).toBe(now);
  });

  it('includes real mark timestamps that fall outside every bar', () => {
    const extent = fullExtent(
      [
        {
          ...span({ id: 'a', label: 'a', startMs: 1_000, endMs: 2_000 }),
          artifactAtMs: [9_000],
          toolMarks: [{ atMs: 500, label: 'x' }],
        },
      ],
      0,
    );
    expect(extent).toEqual({ min: 500, max: 9_000 });
  });

  it('widens a zero-width extent instead of dividing by zero', () => {
    const extent = fullExtent([span({ id: 'a', label: 'a', startMs: 7, endMs: 7 })], 0);
    expect(extent.max).toBeGreaterThan(extent.min);
    expect(Number.isFinite(percentIn(7, extent))).toBe(true);
  });

  it('clips a bar to the visible window and flags which side ran off', () => {
    const bar = barGeometry(
      span({ id: 'a', label: 'a', startMs: 0, endMs: 10_000 }),
      { min: 2_000, max: 8_000 },
      0,
    );
    expect(bar).not.toBeNull();
    expect(bar!.left).toBe(0);
    expect(bar!.width).toBe(100);
    expect(bar!.clippedStart).toBe(true);
    expect(bar!.clippedEnd).toBe(true);
  });

  it('renders NOTHING for a span entirely outside the window — never a bar pinned to an edge it does not touch', () => {
    expect(
      barGeometry(span({ id: 'a', label: 'a', startMs: 0, endMs: 100 }), { min: 5_000, max: 8_000 }, 0),
    ).toBeNull();
  });

  it('closes a running bar at now, never past the real data', () => {
    const bar = barGeometry(
      span({ id: 'r', label: 'r', startMs: 0, endMs: null, state: 'running' }),
      { min: 0, max: 10_000 },
      4_000,
    );
    expect(bar!.left).toBe(0);
    expect(bar!.width).toBeCloseTo(40, 6);
  });
});
