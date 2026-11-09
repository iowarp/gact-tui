import type { Artifact, ArtifactLineage, ArtifactVersion } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';
import { layoutArtifactLineage, layoutVersionChain } from './artifact-lineage-layout';

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
  it('folds earlier versions into the current node and keeps every other relationship', () => {
    const graph = layoutArtifactLineage(artifact, lineage, { earlier: 1 });
    expect(graph.nodes.map((node) => node.id)).not.toContain('artifact_plot_v1');
    expect(graph.edges).toHaveLength(4);
    expect(graph.files).toBe(2);
    expect(graph.actions).toBe(2);
    const self = graph.nodes.find((node) => node.kind === 'self');
    expect(self).toMatchObject({ detail: 'v2, 1 earlier', stacked: true, folds: true });
  });

  it('opens actions in Activity and marks failures and custody gaps', () => {
    const graph = layoutArtifactLineage(artifact, lineage);
    const plot = graph.nodes.find((node) => node.id === 'activity:call_plot');
    expect(plot).toMatchObject({ kind: 'action', callId: 'call_plot', detail: 'failed' });
    const gap = graph.nodes.find((node) => node.id === 'artifact_edit');
    expect(gap).toMatchObject({ kind: 'gap', name: 'Edited outside' });
    expect(graph.edges.find((edge) => edge.from === 'artifact_edit')?.gap).toBe(true);
    expect(graph.nodes.every((node) => node.x >= 0 && Number.isFinite(node.y))).toBe(true);
  });

  it('says when a file has no recorded source or the graph was cut short', () => {
    const graph = layoutArtifactLineage(artifact, {
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
  });
});

describe('layoutVersionChain', () => {
  it('orders versions oldest first with their age and maker', () => {
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
    const graph = layoutVersionChain(
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
