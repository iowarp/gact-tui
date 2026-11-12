import type { Artifact, ArtifactLineage, ArtifactVersion } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';
import {
  fitLineageLayout,
  layoutArtifactLineage,
  layoutVersionChain,
  type LineageSpread,
} from './artifact-lineage-layout';

const artifact: Artifact = {
  id: 'artifact_plot',
  session_id: 'session_1',
  name: 'MTA1_east_north_up.png',
  media_type: 'image/png',
  uri: 'artifact://artifact_plot',
};

const lineage: ArtifactLineage = {
  root: 'artifact_plot',
  direction: 'both',
  depth: 5,
  nodes: [
    { id: 'activity:call_stage', type: 'activity', tool: 'ndp_stage_resource', status: 'success' },
    { id: 'artifact_csv', type: 'artifact', name: 'MTA1.CI.LY_30.csv', version: 1 },
    { id: 'activity:call_plot', type: 'activity', tool: 'plot_timeseries', status: 'failed' },
    { id: 'artifact_plot', type: 'artifact', name: 'MTA1_east_north_up.png', version: 2 },
    { id: 'artifact_plot_v1', type: 'artifact', name: 'MTA1_east_north_up.png', version: 1 },
    { id: 'artifact_edit', type: 'artifact', name: 'notes.md', custody_gap: true },
  ],
  edges: [
    { from: 'activity:call_stage', to: 'artifact_csv', type: 'generated', evidence: 'declared' },
    { from: 'artifact_csv', to: 'activity:call_plot', type: 'used', evidence: 'declared' },
    { from: 'activity:call_plot', to: 'artifact_plot', type: 'generated', evidence: 'declared' },
    { from: 'artifact_plot', to: 'artifact_plot_v1', type: 'revision_of', evidence: 'declared' },
    { from: 'artifact_edit', to: 'activity:call_plot', type: 'used', evidence: 'declared' },
  ],
};

describe('layoutArtifactLineage', () => {
  it('folds earlier versions into the current node and keeps every other relationship', async () => {
    const graph = await layoutArtifactLineage(artifact, lineage, { earlier: 1 });
    expect(graph.nodes.map((node) => node.id)).not.toContain('artifact_plot_v1');
    expect(graph.edges).toHaveLength(4);
    expect(graph.files).toBe(2);
    expect(graph.actions).toBe(2);
    const self = graph.nodes.find((node) => node.kind === 'self');
    expect(self).toMatchObject({ detail: 'v2, 1 earlier', stacked: true, folds: true });
  });

  it('opens actions in Activity and marks failures and custody gaps', async () => {
    const graph = await layoutArtifactLineage(artifact, lineage);
    const plot = graph.nodes.find((node) => node.id === 'activity:call_plot');
    expect(plot).toMatchObject({ kind: 'action', callId: 'call_plot', detail: 'failed' });
    const gap = graph.nodes.find((node) => node.id === 'artifact_edit');
    expect(gap).toMatchObject({ kind: 'gap', name: 'Edited outside' });
    expect(graph.edges.find((edge) => edge.from === 'artifact_edit')?.gap).toBe(true);
    expect(graph.nodes.every((node) => node.x >= 0 && Number.isFinite(node.y))).toBe(true);
  });

  it('says when a file has no recorded source or the graph was cut short', async () => {
    const graph = await layoutArtifactLineage(artifact, {
      root: 'artifact_plot',
      direction: 'both',
      depth: 5,
      nodes: [{ id: 'artifact_plot', type: 'artifact', name: 'MTA1_east_north_up.png' }],
      edges: [],
      truncated: { reason: 'depth', at_depth: 5 },
    });
    expect(graph.nodes.map((node) => node.name)).toEqual([
      'No recorded source',
      'MTA1_east_north_up.png',
      'Cut short',
    ]);
    expect(graph.edges.find((edge) => edge.from === 'gap:cut-short')).toMatchObject({
      to: 'artifact_plot',
      gap: true,
    });
  });

  it('draws a cut-short graph as an amber gap into the column where the walk stopped', async () => {
    const graph = await layoutArtifactLineage(artifact, {
      ...lineage,
      truncated: { reason: 'depth', at_depth: 2 },
    });
    const cut = graph.nodes.find((node) => node.id === 'gap:cut-short');
    expect(cut).toMatchObject({ kind: 'gap', name: 'Cut short', detail: 'at depth 2' });
    // Two steps upstream of the plot sits the CSV; the custody gap beside it is already a break.
    const into = graph.edges.filter((edge) => edge.from === 'gap:cut-short');
    expect(into.map((edge) => [edge.to, edge.gap])).toEqual([['artifact_csv', true]]);
    const csv = graph.nodes.find((node) => node.id === 'artifact_csv')!;
    expect(cut!.x + cut!.width).toBeLessThan(csv.x);
  });

  it('cuts downstream when only the readers reach the reported depth', async () => {
    const graph = await layoutArtifactLineage(artifact, {
      root: 'artifact_csv',
      direction: 'downstream',
      depth: 1,
      nodes: lineage.nodes.slice(0, 3),
      edges: lineage.edges.slice(0, 2),
      truncated: { reason: 'depth', at_depth: 1 },
    });
    expect(graph.edges.filter((edge) => edge.to === 'gap:cut-short')).toMatchObject([
      { from: 'activity:call_plot', gap: true },
    ]);
    expect(graph.nodes.find((node) => node.id === 'gap:cut-short')?.tip).toContain('Later steps');
  });

  it('puts the producing tool above an outside edit that feeds the same file', async () => {
    const graph = await layoutArtifactLineage(artifact, {
      root: 'artifact_plot',
      direction: 'both',
      depth: 5,
      nodes: [
        {
          id: 'artifact_edit',
          type: 'artifact',
          name: 'MTA1_east_north_up.png',
          custody_gap: true,
        },
        { id: 'activity:call_plot', type: 'activity', tool: 'plot_timeseries', status: 'ok' },
        { id: 'artifact_plot', type: 'artifact', name: 'MTA1_east_north_up.png', version: 2 },
      ],
      edges: [
        { from: 'artifact_edit', to: 'artifact_plot', type: 'used', evidence: 'observed' },
        {
          from: 'activity:call_plot',
          to: 'artifact_plot',
          type: 'generated',
          evidence: 'declared',
        },
      ],
    });
    const tool = graph.nodes.find((node) => node.id === 'activity:call_plot')!;
    const edit = graph.nodes.find((node) => node.id === 'artifact_edit')!;
    expect(tool.y).toBeLessThan(edit.y);
    const edge = graph.edges.find((entry) => entry.from === 'activity:call_plot')!;
    // The edge leaves the tool's right side and is routed in right angles.
    const [, x, y] = /^M([\d.]+),([\d.]+)/u.exec(edge.path)!;
    expect(Number(x)).toBe(tool.x + tool.width);
    expect(Number(y)).toBeGreaterThan(tool.y);
    expect(Number(y)).toBeLessThan(tool.y + 40);
  });
});

describe('fitLineageLayout', () => {
  const build = (spread?: LineageSpread) => layoutArtifactLineage(artifact, lineage, { spread });

  it('re-lays a dragged graph around the positions it is given, keeping their order', async () => {
    const fitted = await build(undefined);
    const at = (graph: typeof fitted) =>
      Object.fromEntries(graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    const same = await layoutArtifactLineage(artifact, lineage, {
      spread: fitted.spread,
      hints: at(fitted),
    });
    expect(at(same)).toEqual(at(fitted));
    // Every edge is routed again, from its source's right side to its target's left.
    for (const edge of same.edges) {
      const from = same.nodes.find((node) => node.id === edge.from)!;
      expect(edge.path.startsWith(`M${from.x + from.width},`)).toBe(true);
    }
  });

  it('keeps whole names when the pane is narrower than the drawing', async () => {
    const compact = await build(undefined);
    const fitted = await fitLineageLayout(build, 200);
    expect(fitted.width).toBeGreaterThan(compact.width);
    const plot = fitted.nodes.find((node) => node.id === 'artifact_plot')!;
    const compactPlot = compact.nodes.find((node) => node.id === 'artifact_plot')!;
    expect(plot.width).toBeGreaterThan(compactPlot.width);
  });

  it('spreads the columns into spare room without overflowing it', async () => {
    const named = await fitLineageLayout(build, undefined);
    const room = named.width + 200;
    const spread = await fitLineageLayout(build, room);
    expect(spread.width).toBeGreaterThan(named.width);
    expect(spread.width).toBeLessThanOrEqual(room);
  });
});

describe('layoutVersionChain', () => {
  it('orders versions oldest first with their age and maker', async () => {
    const version = (n: number, extra: Partial<ArtifactVersion> = {}) =>
      ({
        artifact_id: `artifact_v${n}`,
        workspace_id: 'ws',
        name: 'soil.csv',
        version: n,
        created_at: new Date(Date.UTC(2026, 0, 10) - (4 - n) * 86_400_000).toISOString(),
        producer: {},
        ...extra,
      }) as ArtifactVersion;
    const graph = await layoutVersionChain(
      artifact,
      [
        version(2, { custody_gap: true }),
        version(3, { producer: { tool: 'soil_qc.py' } }),
        version(1),
      ],
      3,
      Date.UTC(2026, 0, 10),
    );
    expect(graph.nodes.map((node) => [node.name, node.detail, node.kind])).toEqual([
      ['v1', `3d, ${vocab.agent}`, 'file'],
      ['v2', `2d, outside ${vocab.agent}`, 'gap'],
      ['v3', '24h, soil_qc.py', 'self'],
    ]);
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes[0]?.artifact?.id).toBe('artifact_v1');
  });
});
