/**
 * The provenance DATA-FLOW model (regrammar, owner sketch 2026-08-06).
 *
 * These pin the four facts the regrammar rests on, each on the model rather
 * than on a rendered pixel: the dedup collapse keys ONLY on server-recorded
 * identity, inputs really converge on ONE transform, an artifact's uses hang
 * off it as outgoing edges, and a session is a badge (or at most a light box
 * for a genuinely foreign one) — never a container per re-derivation.
 *
 * Every collapse assertion has a sabotage twin: change one recorded fact and
 * the collapse must NOT happen.
 */
import { describe, expect, it } from 'vitest';
import { provenanceModel, transformKey } from '../../src/detail/provenanceModel';
import type { RouteStep } from '../../src/detail/types';

/**
 * The live EarthScope shape, minimised: ONE input CSV consumed by SIX
 * `pandas_filter_data` activities in six different sessions, all of which the
 * wire records as generating the SAME output artifact id (one id ⇒ one sha).
 * This is the pile the old view drew as six session boxes.
 */
function sixReDerivations(overrides: Partial<Record<number, Partial<RouteStep>>> = {}): RouteStep[] {
  const route: RouteStep[] = [
    { kind: 'node', nodeType: 'artifact', label: 'converted.csv', artifactId: 'artifact_in' },
  ];
  const sessions = ['sess_a', 'sess_b', 'sess_c', 'sess_d', 'sess_e', 'sess_f'];
  sessions.forEach((sessionId, at) => {
    const nodeIndex = 1 + at * 3;
    route.push({
      kind: 'edge',
      edge: 'used',
      stance: 'hash-pair',
      fromIndex: 0,
      toIndex: nodeIndex + 1,
    });
    route.push({
      kind: 'node',
      nodeType: 'activity',
      label: 'pandas_filter_data',
      tool: 'pandas_filter_data',
      status: 'reproducible',
      sessionId,
      foreignSession: true,
      turnId: `msg_${sessionId}`,
      ...(overrides[at] ?? {}),
    } as RouteStep);
    route.push({
      kind: 'edge',
      edge: 'generated',
      stance: 'hash-pair',
      fromIndex: nodeIndex + 1,
      toIndex: 19,
    });
  });
  route.push({
    kind: 'node',
    nodeType: 'artifact',
    label: 'clean.csv',
    artifactId: 'artifact_out',
    version: 'v1',
    self: true,
  });
  return route;
}

describe('dedup collapse (regrammar rule 2)', () => {
  it('folds six same-transform re-derivations into ONE node carrying ×6', () => {
    const model = provenanceModel(sixReDerivations());
    const transforms = model.nodes.filter((node) => node.kind === 'transform');
    expect(transforms).toHaveLength(1);
    expect(transforms[0]!.multiplicity).toBe(6);
    expect(transforms[0]!.node.label).toBe('pandas_filter_data');
  });

  it('keeps every collapsed run addressable — the expandable per-run list', () => {
    const model = provenanceModel(sixReDerivations());
    const runs = model.nodes.find((node) => node.kind === 'transform')!.runs;
    expect(runs).toHaveLength(6);
    expect(runs.map((run) => run.sessionId)).toEqual([
      'sess_a',
      'sess_b',
      'sess_c',
      'sess_d',
      'sess_e',
      'sess_f',
    ]);
    // Each run keeps its own turn, which is the "which turn did it serve?"
    // context the transform hovers show.
    expect(runs.map((run) => run.turnId)).toEqual([
      'msg_sess_a',
      'msg_sess_b',
      'msg_sess_c',
      'msg_sess_d',
      'msg_sess_e',
      'msg_sess_f',
    ]);
    // Route order, so the list is stable and the primary run is the first.
    expect(runs.map((run) => run.index)).toEqual([2, 5, 8, 11, 14, 17]);
  });

  it('collapses the six IDENTICAL edges too, keeping the count on the edge', () => {
    const model = provenanceModel(sixReDerivations());
    expect(model.edges).toHaveLength(2);
    const used = model.edges.find((edge) => edge.edge.edge === 'used')!;
    const generated = model.edges.find((edge) => edge.edge.edge === 'generated')!;
    expect(used.multiplicity).toBe(6);
    expect(generated.multiplicity).toBe(6);
  });

  it('SABOTAGE: a different tool never collapses, however alike everything else', () => {
    const model = provenanceModel(sixReDerivations({ 3: { tool: 'polars_filter_data' } as never }));
    expect(model.nodes.filter((node) => node.kind === 'transform')).toHaveLength(2);
  });

  it('SABOTAGE: a different recorded status never collapses', () => {
    const model = provenanceModel(sixReDerivations({ 2: { status: 'failed' } as never }));
    const transforms = model.nodes.filter((node) => node.kind === 'transform');
    expect(transforms.map((node) => node.multiplicity).sort()).toEqual([1, 5]);
  });

  it('SABOTAGE: a different input artifact id never collapses', () => {
    const route = sixReDerivations();
    // Re-point run 4's `used` edge at a second, different input artifact.
    route.push({ kind: 'node', nodeType: 'artifact', label: 'other.csv', artifactId: 'artifact_other' });
    const otherIndex = route.length - 1;
    const usedEdge = route.findIndex(
      (step, at) => step.kind === 'edge' && step.edge === 'used' && at === 10,
    );
    (route[usedEdge] as { fromIndex?: number }).fromIndex = otherIndex;
    const model = provenanceModel(route);
    const transforms = model.nodes.filter((node) => node.kind === 'transform');
    expect(transforms.map((node) => node.multiplicity).sort()).toEqual([1, 5]);
  });

  it('SABOTAGE: same tool and same inputs but NO recorded output is not dedup evidence', () => {
    const route: RouteStep[] = [
      { kind: 'node', nodeType: 'artifact', label: 'a.csv', artifactId: 'artifact_a' },
      { kind: 'edge', edge: 'used', fromIndex: 0, toIndex: 2 },
      { kind: 'node', nodeType: 'activity', label: 'probe', tool: 'probe' },
      { kind: 'edge', edge: 'used', fromIndex: 0, toIndex: 4 },
      { kind: 'node', nodeType: 'activity', label: 'probe', tool: 'probe' },
    ];
    const model = provenanceModel(route);
    expect(model.nodes.filter((node) => node.kind === 'transform')).toHaveLength(2);
    expect(transformKey(route, 2, [])).toBeNull();
  });

  it('SABOTAGE: an input the wire gave no artifact id carries no dedup evidence', () => {
    const route: RouteStep[] = [
      // An external authority-only leaf — no artifactId anywhere in the wire.
      { kind: 'node', nodeType: 'artifact', label: 'ds2.org/…csv', sub: 'external source' },
      { kind: 'edge', edge: 'used', fromIndex: 0, toIndex: 2 },
      { kind: 'node', nodeType: 'activity', label: 'stage', tool: 'stage' },
      { kind: 'edge', edge: 'generated', fromIndex: 2, toIndex: 6 },
      { kind: 'edge', edge: 'used', fromIndex: 0, toIndex: 5 },
      { kind: 'node', nodeType: 'activity', label: 'stage', tool: 'stage' },
      { kind: 'node', nodeType: 'artifact', label: 'out.csv', artifactId: 'artifact_out' },
      { kind: 'edge', edge: 'generated', fromIndex: 5, toIndex: 6 },
    ];
    const model = provenanceModel(route);
    expect(model.nodes.filter((node) => node.kind === 'transform')).toHaveLength(2);
  });
});

describe('convergence (regrammar rule 1)', () => {
  const TWO_INPUTS: RouteStep[] = [
    { kind: 'node', nodeType: 'artifact', label: 'a.csv', artifactId: 'artifact_a' },
    { kind: 'edge', edge: 'used', stance: 'hash-pair', fromIndex: 0, toIndex: 4 },
    { kind: 'node', nodeType: 'artifact', label: 'b.csv', artifactId: 'artifact_b' },
    { kind: 'edge', edge: 'used', stance: 'hash-pair', fromIndex: 2, toIndex: 4 },
    { kind: 'node', nodeType: 'activity', label: 'create_artifact', tool: 'create_artifact' },
    { kind: 'edge', edge: 'generated', stance: 'hash-pair', fromIndex: 4, toIndex: 6 },
    { kind: 'node', nodeType: 'artifact', label: 'report.md', artifactId: 'artifact_r', self: true },
  ];

  it('both inputs converge INTO the one transform — in-degree 2', () => {
    const model = provenanceModel(TWO_INPUTS);
    const transform = model.nodes.find((node) => node.kind === 'transform')!;
    const incoming = model.edges.filter((edge) => edge.target === transform.id);
    expect(incoming).toHaveLength(2);
    expect(incoming.map((edge) => edge.source).sort()).toEqual(['0', '2']);
    expect(incoming.every((edge) => edge.edge.edge === 'used')).toBe(true);
  });

  it("the transform's generated edge lands on the produced artifact — out-degree 1", () => {
    const model = provenanceModel(TWO_INPUTS);
    const transform = model.nodes.find((node) => node.kind === 'transform')!;
    const outgoing = model.edges.filter((edge) => edge.source === transform.id);
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]!.target).toBe('6');
    expect(outgoing[0]!.edge.edge).toBe('generated');
  });

  it('a transform is a NODE, never a session container — no cluster holds it', () => {
    const route = TWO_INPUTS.map((step) =>
      step.kind === 'node' && step.nodeType === 'activity'
        ? { ...step, sessionId: 'sess_child', treeSession: true, runLabel: 'ndp #1' }
        : step,
    );
    const model = provenanceModel(route);
    expect(model.clusters).toEqual([]);
    const transform = model.nodes.find((node) => node.kind === 'transform')!;
    expect(transform.clusterId).toBeUndefined();
    // Identity rides the node as a badge instead.
    expect(transform.producer).toMatchObject({ runLabel: 'ndp #1', sessionId: 'sess_child' });
  });
});

describe('usage edges (regrammar rule 3)', () => {
  const USED_DOWNSTREAM: RouteStep[] = [
    { kind: 'node', nodeType: 'activity', label: 'plot', tool: 'plot' },
    { kind: 'edge', edge: 'generated', stance: 'hash-pair', fromIndex: 0, toIndex: 2 },
    { kind: 'node', nodeType: 'artifact', label: 'chart.png', artifactId: 'artifact_png', self: true },
    { kind: 'edge', edge: 'used', stance: 'hash-pair', fromIndex: 2, toIndex: 4 },
    { kind: 'node', nodeType: 'activity', label: 'create_artifact', tool: 'create_artifact', sessionId: 'sess_x' },
    { kind: 'edge', edge: 'used', stance: 'hash-pair', fromIndex: 2, toIndex: 6 },
    { kind: 'node', nodeType: 'activity', label: 'report_writer', tool: 'report_writer', sessionId: 'sess_y' },
  ];

  it("the self artifact's uses hang off it as OUTGOING edges, marked as usage", () => {
    const model = provenanceModel(USED_DOWNSTREAM);
    const self = model.nodes.find((node) => node.node.self)!;
    const uses = model.edges.filter((edge) => edge.source === self.id && edge.edge.edge === 'used');
    expect(uses).toHaveLength(2);
    expect(uses.every((edge) => edge.usage)).toBe(true);
    expect(uses.map((edge) => edge.target).sort()).toEqual(['4', '6']);
  });

  it('a cross-session use is a use like any other — it is never dropped', () => {
    const model = provenanceModel(USED_DOWNSTREAM);
    const targets = model.edges
      .filter((edge) => edge.usage)
      .map((edge) => model.nodes.find((node) => node.id === edge.target)!.node.sessionId);
    expect(targets.sort()).toEqual(['sess_x', 'sess_y']);
  });

  it('an INPUT edge is not a usage of the self artifact', () => {
    const model = provenanceModel(USED_DOWNSTREAM);
    expect(model.edges.filter((edge) => edge.edge.edge === 'generated').every((e) => !e.usage)).toBe(true);
  });

  it('a re-designation (used AND generated by one transform) keeps BOTH edges, ranking on one', () => {
    // The live wire's own shape: create_artifact re-registered the png it also
    // produced. Deleting either edge would delete a recorded fact.
    const route: RouteStep[] = [
      { kind: 'node', nodeType: 'artifact', label: 'chart.png', artifactId: 'artifact_png', self: true },
      { kind: 'edge', edge: 'used', stance: 'hash-pair', fromIndex: 0, toIndex: 2 },
      { kind: 'node', nodeType: 'activity', label: 'create_artifact', tool: 'create_artifact' },
      { kind: 'edge', edge: 'generated', stance: 'hash-pair', fromIndex: 2, toIndex: 0 },
    ];
    const model = provenanceModel(route);
    expect(model.edges).toHaveLength(2);
    expect(model.edges.filter((edge) => edge.back)).toHaveLength(1);
    expect(model.edges.filter((edge) => !edge.back)).toHaveLength(1);
  });
});

describe('session identity is a badge, not a box (regrammar rule 1)', () => {
  it('an in-tree producer never gets a cluster — it gets its run label', () => {
    const route: RouteStep[] = [
      {
        kind: 'node',
        nodeType: 'activity',
        label: 'ndp_stage_resource',
        tool: 'ndp_stage_resource',
        sessionId: 'sess_child',
        treeSession: true,
        runLabel: 'ndp #1',
      },
      { kind: 'edge', edge: 'generated', fromIndex: 0, toIndex: 2 },
      { kind: 'node', nodeType: 'artifact', label: 'a.csv', artifactId: 'artifact_a', self: true },
    ];
    const model = provenanceModel(route);
    expect(model.clusters).toEqual([]);
    expect(model.nodes[0]!.producer).toMatchObject({ runLabel: 'ndp #1' });
  });

  it('a collapsed transform spanning sessions names NO producer — it is ambiguous', () => {
    const model = provenanceModel(sixReDerivations());
    const transform = model.nodes.find((node) => node.kind === 'transform')!;
    expect(transform.producerAmbiguous).toBe(true);
    expect(transform.producer).toBeUndefined();
    // …and the artifact those six produced inherits the ambiguity rather than
    // claiming one of the six sessions made it.
    const produced = model.nodes.find((node) => node.node.self)!;
    expect(produced.producerAmbiguous).toBe(true);
    expect(produced.clusterId).toBeUndefined();
  });

  it('six re-derivations produce ZERO cluster boxes — the noise the owner marked', () => {
    expect(provenanceModel(sixReDerivations()).clusters).toEqual([]);
  });

  it('a genuinely foreign session keeps ONE light box over its contiguous run', () => {
    const route: RouteStep[] = [
      {
        kind: 'node',
        nodeType: 'activity',
        label: 'ndp_stage_resource',
        tool: 'ndp_stage_resource',
        sessionId: 'sess_far',
        foreignSession: true,
      },
      { kind: 'edge', edge: 'generated', fromIndex: 0, toIndex: 2 },
      {
        kind: 'node',
        nodeType: 'artifact',
        label: 'a.csv',
        artifactId: 'artifact_a',
        sessionId: 'sess_far',
        foreignSession: true,
        createdAt: '2026-08-05T12:43:10Z',
      },
      { kind: 'edge', edge: 'used', fromIndex: 2, toIndex: 4 },
      { kind: 'node', nodeType: 'artifact', label: 'b.csv', artifactId: 'artifact_b', self: true },
    ];
    const model = provenanceModel(route);
    expect(model.clusters).toHaveLength(1);
    expect(model.clusters[0]).toMatchObject({
      sessionId: 'sess_far',
      memberIds: ['0', '2'],
      createdAt: '2026-08-05T12:43:10Z',
    });
  });
});

describe('determinism', () => {
  it('the same route always yields the same model', () => {
    const a = provenanceModel(sixReDerivations());
    const b = provenanceModel(JSON.parse(JSON.stringify(sixReDerivations())) as RouteStep[]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('an empty route is an empty model, not a crash', () => {
    expect(provenanceModel([])).toEqual({ nodes: [], edges: [], clusters: [] });
  });
});
