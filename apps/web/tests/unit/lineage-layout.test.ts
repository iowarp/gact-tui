/**
 * The provenance DAG layout (regrammar, 2026-08-06).
 *
 * The graph is drawn by React Flow, but the GEOMETRY is ours: dagre over node
 * widths computed from character counts (the lines are monospace, so that is
 * exact). These pin the properties that make that choice defensible —
 * determinism, real convergence, cluster boxes dagre itself owns, and the
 * routing invariant behind the owner's "under" annotation: nothing is ever
 * drawn through a box it does not belong to.
 */
import { describe, expect, it } from 'vitest';
import { layoutLineage, nodeBadges, nodeChips, nodeWidth } from '../../src/detail/lineageLayout';
import { provenanceModel } from '../../src/detail/provenanceModel';
import type { RouteStep } from '../../src/detail/types';

/** A simple local chain, all one session. */
const SIMPLE_CHAIN: RouteStep[] = [
  {
    kind: 'node',
    nodeType: 'artifact',
    label: 'MTA1.CI.LY_.30.csv',
    artifactId: 'art_csv',
    version: 'v1',
    size: '50.4 MB',
  },
  { kind: 'edge', edge: 'used', stance: 'hashed-at-use', fromIndex: 0, toIndex: 2 },
  { kind: 'node', nodeType: 'activity', label: 'plot_plot_timeseries', duration: '7.9s' },
  { kind: 'edge', edge: 'generated', stance: 'hashed-at-use', fromIndex: 2, toIndex: 4 },
  {
    kind: 'node',
    nodeType: 'artifact',
    label: 'MTA1.CI.LY_.30_position.png',
    artifactId: 'art_png',
    version: 'v1',
    size: '179 KB',
    self: true,
  },
];

/** Three inputs converging on one transform. */
const MULTI_INPUT: RouteStep[] = [
  { kind: 'node', nodeType: 'artifact', label: 'a.csv', artifactId: 'art_a' },
  { kind: 'edge', edge: 'used', stance: 'declared', join: true, fromIndex: 0, toIndex: 6 },
  { kind: 'node', nodeType: 'artifact', label: 'b.png', artifactId: 'art_b' },
  { kind: 'edge', edge: 'used', stance: 'declared', join: true, fromIndex: 2, toIndex: 6 },
  { kind: 'node', nodeType: 'artifact', label: 'c.csv', artifactId: 'art_c' },
  { kind: 'edge', edge: 'used', stance: 'declared', join: true, fromIndex: 4, toIndex: 6 },
  { kind: 'node', nodeType: 'activity', label: 'create_artifact', status: 'gap' },
  { kind: 'edge', edge: 'generated', stance: 'hashed-at-use', fromIndex: 6, toIndex: 8 },
  { kind: 'node', nodeType: 'artifact', label: 'report.md', artifactId: 'art_r', self: true },
];

/** A genuinely foreign session minted the CSV. */
const CROSS_SESSION: RouteStep[] = [
  {
    kind: 'node',
    nodeType: 'activity',
    label: 'ndp_stage_resource',
    sessionId: 'sess_9f17aa20bb31',
    foreignSession: true,
    duration: '1.7s',
  },
  { kind: 'edge', edge: 'generated', stance: 'hashed-at-use', fromIndex: 0, toIndex: 2 },
  {
    kind: 'node',
    nodeType: 'artifact',
    label: 'MTA1.CI.LY_.30.csv',
    artifactId: 'art_csv',
    sessionId: 'sess_9f17aa20bb31',
    foreignSession: true,
    createdAt: '2026-08-05T12:43:10Z',
  },
  { kind: 'edge', edge: 'used', stance: 'hashed-at-use', fromIndex: 2, toIndex: 4 },
  { kind: 'node', nodeType: 'activity', label: 'plot_plot_timeseries', duration: '7.9s' },
  { kind: 'edge', edge: 'generated', stance: 'hashed-at-use', fromIndex: 4, toIndex: 6 },
  { kind: 'node', nodeType: 'artifact', label: 'plot.png', artifactId: 'art_png', self: true },
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('layoutLineage — determinism', () => {
  it('produces byte-identical coordinates for the same route, every time', () => {
    const a = layoutLineage(SIMPLE_CHAIN);
    const b = layoutLineage(SIMPLE_CHAIN);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('does not depend on measurement — the same route from a fresh array lays out the same', () => {
    const clone: RouteStep[] = JSON.parse(JSON.stringify(SIMPLE_CHAIN));
    expect(layoutLineage(clone).nodes.map((n) => [n.x, n.y])).toEqual(
      layoutLineage(SIMPLE_CHAIN).nodes.map((n) => [n.x, n.y]),
    );
  });

  it('reads chronologically top→bottom: each node is strictly below its producer', () => {
    const layout = layoutLineage(SIMPLE_CHAIN);
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const edge of layout.edges) {
      expect(byId.get(edge.source)!.y).toBeLessThan(byId.get(edge.target)!.y);
    }
  });

  it('lands the self artifact last (deepest on the canvas)', () => {
    const layout = layoutLineage(SIMPLE_CHAIN);
    const self = layout.nodes.find((node) => node.node.self)!;
    for (const node of layout.nodes) {
      if (node === self) continue;
      expect(node.y).toBeLessThan(self.y);
    }
  });
});

describe('layoutLineage — topology', () => {
  it('keeps every node and every edge exactly once', () => {
    const layout = layoutLineage(SIMPLE_CHAIN);
    expect(layout.nodes.map((node) => node.index)).toEqual([0, 2, 4]);
    expect(layout.edges.map((edge) => edge.index)).toEqual([1, 3]);
  });

  it('converges every input of a multi-input transform onto that ONE transform', () => {
    const layout = layoutLineage(MULTI_INPUT);
    const consuming = layout.nodes.find((node) => node.node.label === 'create_artifact')!;
    const incoming = layout.edges.filter((edge) => edge.target === consuming.id);
    expect(incoming).toHaveLength(3);
    expect(incoming.map((edge) => edge.source).sort()).toEqual(['0', '2', '4']);
    // The three inputs sit ABOVE it, side by side — a real branch, not a list.
    const inputs = layout.nodes.filter((node) => ['0', '2', '4'].includes(node.id));
    for (const input of inputs) expect(input.y).toBeLessThan(consuming.y);
    expect(new Set(inputs.map((node) => node.y)).size).toBe(1);
    expect(new Set(inputs.map((node) => node.x)).size).toBe(3);
  });

  it('uses the recorded endpoints, not list adjacency, for a join edge', () => {
    const layout = layoutLineage(MULTI_INPUT);
    const joining = layout.edges.find((edge) => edge.index === 1)!;
    expect(joining.source).toBe('0');
    // Adjacency would have said node 2; the recorded endpoint says node 6.
    expect(joining.target).toBe('6');
  });

  it('falls back to list adjacency for a legacy route with no recorded endpoints', () => {
    const legacy: RouteStep[] = [
      { kind: 'node', nodeType: 'artifact', label: 'a.csv' },
      { kind: 'edge', edge: 'used', stance: 'declared' },
      { kind: 'node', nodeType: 'activity', label: 'tool' },
    ];
    const layout = layoutLineage(legacy);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0]).toMatchObject({ source: '0', target: '2' });
  });

  it('drops a self-edge rather than drawing a loop that means nothing', () => {
    const looped: RouteStep[] = [
      { kind: 'node', nodeType: 'artifact', label: 'a.csv' },
      { kind: 'edge', edge: 'used', fromIndex: 0, toIndex: 0 },
    ];
    expect(layoutLineage(looped).edges).toHaveLength(0);
  });

  it('returns an empty layout for a route with no nodes at all', () => {
    expect(layoutLineage([])).toEqual({ nodes: [], edges: [], clusters: [], width: 0, height: 0 });
  });
});

describe('layoutLineage — nothing is drawn through a box (the "under" bug)', () => {
  /** The shape that produced the bug: a long input edge that must travel PAST
   *  a foreign session's box on its way to the transform that consumed it. */
  const PAST_A_CLUSTER: RouteStep[] = [
    { kind: 'node', nodeType: 'artifact', label: 'seed.csv', artifactId: 'art_seed' },
    { kind: 'edge', edge: 'used', stance: 'hash-pair', join: true, fromIndex: 0, toIndex: 8 },
    {
      kind: 'node',
      nodeType: 'activity',
      label: 'ndp_stage_resource',
      tool: 'ndp_stage_resource',
      sessionId: 'sess_far',
      foreignSession: true,
    },
    { kind: 'edge', edge: 'generated', stance: 'hash-pair', fromIndex: 2, toIndex: 4 },
    {
      kind: 'node',
      nodeType: 'artifact',
      label: 'staged.csv',
      artifactId: 'art_staged',
      sessionId: 'sess_far',
      foreignSession: true,
    },
    { kind: 'edge', edge: 'used', stance: 'hash-pair', fromIndex: 4, toIndex: 8 },
    { kind: 'node', nodeType: 'artifact', label: 'extra.csv', artifactId: 'art_extra' },
    { kind: 'edge', edge: 'used', stance: 'hash-pair', join: true, fromIndex: 6, toIndex: 8 },
    { kind: 'node', nodeType: 'activity', label: 'pandas_filter_data', tool: 'pandas_filter_data' },
    { kind: 'edge', edge: 'generated', stance: 'hash-pair', fromIndex: 8, toIndex: 10 },
    { kind: 'node', nodeType: 'artifact', label: 'clean.csv', artifactId: 'art_clean', self: true },
  ];

  it('never overlaps two node boxes', () => {
    for (const route of [SIMPLE_CHAIN, MULTI_INPUT, CROSS_SESSION, PAST_A_CLUSTER]) {
      const layout = layoutLineage(route);
      for (const a of layout.nodes) {
        for (const b of layout.nodes) {
          if (a.id >= b.id) continue;
          expect(overlaps(a, b)).toBe(false);
        }
      }
    }
  });

  it('never places a non-member node inside a cluster box', () => {
    for (const route of [CROSS_SESSION, PAST_A_CLUSTER]) {
      const layout = layoutLineage(route);
      for (const cluster of layout.clusters) {
        for (const node of layout.nodes) {
          if (cluster.memberIds.includes(node.id)) continue;
          expect(overlaps(cluster, node)).toBe(false);
        }
      }
    }
  });

  it('never routes an outsider edge through a cluster box — dagre OWNS the box', () => {
    // The bug: the box was fitted around its members AFTER layout, so dagre
    // never reserved its space and drew edges straight under it. The box is a
    // compound parent now, so the corridor between two non-members can never
    // enter it.
    const layout = layoutLineage(PAST_A_CLUSTER);
    expect(layout.clusters).toHaveLength(1);
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const edge of layout.edges) {
      const source = byId.get(edge.source)!;
      const target = byId.get(edge.target)!;
      for (const cluster of layout.clusters) {
        if (cluster.memberIds.includes(source.id) || cluster.memberIds.includes(target.id)) continue;
        const sx = source.x + source.width / 2;
        const tx = target.x + target.width / 2;
        const corridor = {
          x: Math.min(sx, tx),
          y: Math.min(source.y + source.height, target.y),
          width: Math.abs(tx - sx),
          height: Math.abs(target.y - (source.y + source.height)),
        };
        expect(overlaps(corridor, cluster)).toBe(false);
      }
    }
  });
});

describe('layoutLineage — session clusters', () => {
  it("boxes a foreign session's nodes, with room above for the header", () => {
    const layout = layoutLineage(CROSS_SESSION);
    expect(layout.clusters).toHaveLength(1);
    const cluster = layout.clusters[0]!;
    expect(cluster.sessionId).toBe('sess_9f17aa20bb31');
    expect(cluster.createdAt).toBe('2026-08-05T12:43:10Z');
    expect(cluster.memberIds.sort()).toEqual(['0', '2']);

    // Every member really is inside the box…
    const members = layout.nodes.filter((node) => cluster.memberIds.includes(node.id));
    for (const member of members) {
      expect(member.x).toBeGreaterThanOrEqual(cluster.x);
      expect(member.y).toBeGreaterThanOrEqual(cluster.y);
      expect(member.x + member.width).toBeLessThanOrEqual(cluster.x + cluster.width);
      expect(member.y + member.height).toBeLessThanOrEqual(cluster.y + cluster.height);
    }
    // …and the header strip sits above the topmost member.
    expect(cluster.y).toBeLessThan(Math.min(...members.map((node) => node.y)));
  });

  it('leaves non-foreign nodes out of every cluster', () => {
    const layout = layoutLineage(CROSS_SESSION);
    const outside = layout.nodes.filter((node) => !node.clusterId).map((node) => node.id);
    expect(outside.sort()).toEqual(['4', '6']);
  });

  it('gives the SAME session two boxes when it appears non-contiguously', () => {
    const route: RouteStep[] = [
      { kind: 'node', nodeType: 'artifact', label: 'a', sessionId: 'sess_x', foreignSession: true },
      { kind: 'edge', edge: 'used', fromIndex: 0, toIndex: 2 },
      { kind: 'node', nodeType: 'activity', label: 'mid', sessionId: 'sess_y', foreignSession: true },
      { kind: 'edge', edge: 'generated', fromIndex: 2, toIndex: 4 },
      { kind: 'node', nodeType: 'artifact', label: 'b', sessionId: 'sess_x', foreignSession: true },
    ];
    const layout = layoutLineage(route);
    const xClusters = layout.clusters.filter((cluster) => cluster.sessionId === 'sess_x');
    expect(xClusters).toHaveLength(2);
    // Distinct ids, or React Flow would collapse them into one box.
    expect(new Set(layout.clusters.map((cluster) => cluster.id)).size).toBe(3);
  });

  it("gives the viewing session's own nodes no cluster at all", () => {
    expect(layoutLineage(SIMPLE_CHAIN).clusters).toEqual([]);
  });
});

describe('node width + chips + badges', () => {
  it('lists exactly the sub-info chips the node line renders, in order', () => {
    expect(nodeChips(SIMPLE_CHAIN[0] as never)).toEqual(['v1', '50.4 MB']);
    expect(nodeChips(SIMPLE_CHAIN[2] as never)).toEqual(['7.9s']);
    expect(
      nodeChips({ kind: 'node', nodeType: 'gap', label: 'g', gapReason: 'why' } as never),
    ).toEqual(['why']);
  });

  it('grows with the visible text — a longer name is a wider node', () => {
    const short = nodeWidth({ kind: 'node', nodeType: 'artifact', label: 'a.csv' });
    const long = nodeWidth({
      kind: 'node',
      nodeType: 'artifact',
      label: 'a_very_long_artifact_file_name.csv',
    });
    expect(long).toBeGreaterThan(short);
  });

  it('reserves room for the badges the line will actually draw', () => {
    const bare = nodeWidth({ kind: 'node', nodeType: 'activity', label: 'pandas_filter_data' });
    const badged = nodeWidth(
      { kind: 'node', nodeType: 'activity', label: 'pandas_filter_data' },
      ['ndp #1', '×6'],
    );
    expect(badged).toBeGreaterThan(bare);
  });

  it('lists the badges the collapsed transform renders — producer, then ×N', () => {
    const model = provenanceModel([
      { kind: 'node', nodeType: 'artifact', label: 'in.csv', artifactId: 'art_in' },
      { kind: 'edge', edge: 'used', fromIndex: 0, toIndex: 2 },
      {
        kind: 'node',
        nodeType: 'activity',
        label: 'pandas_filter_data',
        tool: 'pandas_filter_data',
        sessionId: 'sess_child',
        treeSession: true,
        runLabel: 'ndp #1',
      },
      { kind: 'edge', edge: 'generated', fromIndex: 2, toIndex: 6 },
      { kind: 'edge', edge: 'used', fromIndex: 0, toIndex: 5 },
      {
        kind: 'node',
        nodeType: 'activity',
        label: 'pandas_filter_data',
        tool: 'pandas_filter_data',
        sessionId: 'sess_child',
        treeSession: true,
        runLabel: 'ndp #1',
      },
      { kind: 'node', nodeType: 'artifact', label: 'out.csv', artifactId: 'art_out', self: true },
      { kind: 'edge', edge: 'generated', fromIndex: 5, toIndex: 6 },
    ]);
    const transform = model.nodes.find((node) => node.kind === 'transform')!;
    expect(transform.multiplicity).toBe(2);
    expect(nodeBadges(transform)).toEqual(['ndp #1', '×2']);
  });

  it('clamps to a readable band so one huge name cannot blow out the canvas', () => {
    // PIN UPDATED — regrammar 2026-08-06: the ceiling rose from 460 to 545 so
    // the REAL EarthScope self line (a 35-character name plus its producer
    // badge, version, size and you-are-here marker) fits without the clamp
    // eating its own facts. It is still a hard ceiling.
    const huge = nodeWidth({ kind: 'node', nodeType: 'artifact', label: 'x'.repeat(500) });
    expect(huge).toBeLessThanOrEqual(545);
    const tiny = nodeWidth({ kind: 'node', nodeType: 'artifact', label: 'a' });
    expect(tiny).toBeGreaterThanOrEqual(130);
  });

  it('is a pure function of the node — no ambient state', () => {
    const node = { kind: 'node', nodeType: 'activity', label: 'tool', duration: '1s' } as const;
    expect(nodeWidth(node)).toBe(nodeWidth({ ...node }));
  });
});
