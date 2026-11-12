import type { Artifact, ArtifactLineage } from '@clio/core/v3';
import { AvoidLib } from 'libavoid-js';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  layoutArtifactLineage,
  LINEAGE_NODE_HEIGHT,
  type LineageGraphNode,
} from './artifact-lineage-layout';
import { routeLineage, type AvoidApi } from './lineage-routes';

const loadAvoid = async () => {
  if (!AvoidLib.avoidLib)
    await AvoidLib.load(
      fileURLToPath(
        new URL('../../../node_modules/libavoid-js/dist/libavoid.wasm', import.meta.url),
      ),
    );
  return AvoidLib.getInstance() as unknown as AvoidApi;
};

const artifact: Artifact = {
  id: 'report',
  session_id: 'session_1',
  name: 'report.md',
  media_type: 'text/markdown',
  uri: 'artifact://report',
};

// pipeline.py feeds three steps whose outputs all meet in the report.
const lineage: ArtifactLineage = {
  root: 'report',
  direction: 'both',
  depth: 5,
  nodes: [
    { id: 'pipeline', type: 'artifact', name: 'pipeline.py' },
    { id: 'activity:clean', type: 'activity', tool: 'clean', status: 'success' },
    { id: 'activity:fit', type: 'activity', tool: 'fit', status: 'success' },
    { id: 'activity:plot', type: 'activity', tool: 'plot', status: 'success' },
    { id: 'clean_csv', type: 'artifact', name: 'clean.csv' },
    { id: 'fit_json', type: 'artifact', name: 'fit.json' },
    { id: 'plot_png', type: 'artifact', name: 'plot.png' },
    { id: 'activity:report', type: 'activity', tool: 'write_report', status: 'success' },
    { id: 'report', type: 'artifact', name: 'report.md' },
  ],
  edges: [
    { from: 'pipeline', to: 'activity:clean', type: 'used', evidence: 'declared' },
    { from: 'pipeline', to: 'activity:fit', type: 'used', evidence: 'declared' },
    { from: 'pipeline', to: 'activity:plot', type: 'used', evidence: 'declared' },
    { from: 'activity:clean', to: 'clean_csv', type: 'generated', evidence: 'declared' },
    { from: 'activity:fit', to: 'fit_json', type: 'generated', evidence: 'declared' },
    { from: 'activity:plot', to: 'plot_png', type: 'generated', evidence: 'declared' },
    { from: 'clean_csv', to: 'activity:report', type: 'used', evidence: 'declared' },
    { from: 'fit_json', to: 'activity:report', type: 'used', evidence: 'declared' },
    { from: 'plot_png', to: 'activity:report', type: 'used', evidence: 'declared' },
    { from: 'activity:report', to: 'report', type: 'generated', evidence: 'declared' },
  ],
};

/** The corner points of an edge's path: its straight runs go between consecutive ones. */
function corners(path: string) {
  return [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(([, x, y]) => ({ x: +x!, y: +y! }));
}

/** Whether the run from `a` to `b` passes through the inside of `node`. */
function crosses(a: { x: number; y: number }, b: { x: number; y: number }, node: LineageGraphNode) {
  const [left, right] = [node.x + 1, node.x + node.width - 1];
  const [top, bottom] = [node.y + 1, node.y + LINEAGE_NODE_HEIGHT - 1];
  for (let step = 0; step <= 20; step++) {
    const x = a.x + ((b.x - a.x) * step) / 20;
    const y = a.y + ((b.y - a.y) * step) / 20;
    if (x > left && x < right && y > top && y < bottom) return true;
  }
  return false;
}

describe('routeLineage', () => {
  it('keeps a dropped node where it landed and routes every edge around the others', async () => {
    const graph = await layoutArtifactLineage(artifact, lineage);
    const fit = graph.nodes.find((node) => node.id === 'activity:fit')!;
    const dropped = { x: fit.x + 50, y: fit.y + 35 };
    const routed = await routeLineage(graph, { 'activity:fit': dropped }, loadAvoid);

    expect(routed.nodes.find((node) => node.id === 'activity:fit')).toMatchObject(dropped);
    for (const node of routed.nodes.filter((node) => node.id !== 'activity:fit')) {
      const before = graph.nodes.find((entry) => entry.id === node.id)!;
      expect({ x: node.x, y: node.y }).toEqual({ x: before.x, y: before.y });
    }
    expect(routed.edges).toHaveLength(graph.edges.length);
    for (const edge of routed.edges) {
      expect(edge.path).toMatch(/^M/);
      const points = corners(edge.path);
      const ends = new Set([edge.from, edge.to]);
      for (const node of routed.nodes.filter((node) => !ends.has(node.id)))
        for (let index = 1; index < points.length; index++)
          expect(
            crosses(points[index - 1]!, points[index]!, node),
            `${edge.id} through ${node.id}`,
          ).toBe(false);
    }
    // Each edge leaves its source's right side and arrives at its target's left side.
    const at = new Map(routed.nodes.map((node) => [node.id, node]));
    for (const edge of routed.edges) {
      const points = corners(edge.path);
      const [from, to] = [at.get(edge.from)!, at.get(edge.to)!];
      expect(points[0], edge.id).toEqual({ x: from.x + from.width, y: from.y + 20 });
      expect(Math.round(points.at(-1)!.x), edge.id).toBe(to.x - 1);
      expect(points.at(-1)!.y, edge.id).toBeCloseTo(to.y + LINEAGE_NODE_HEIGHT / 2, 0);
    }
  });

  it('grows the drawing to hold a node dropped past its edge', async () => {
    const graph = await layoutArtifactLineage(artifact, lineage);
    const report = graph.nodes.find((node) => node.id === 'report')!;
    const routed = await routeLineage(
      graph,
      { report: { x: report.x + 200, y: report.y + 300 } },
      loadAvoid,
    );
    expect(routed.width).toBeGreaterThan(graph.width);
    expect(routed.height).toBeGreaterThan(graph.height);
  });
});
