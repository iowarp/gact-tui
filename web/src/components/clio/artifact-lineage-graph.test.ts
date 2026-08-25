import type { Artifact, ArtifactLineage } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { buildArtifactLineageGraph } from './artifact-lineage-graph';

const artifact: Artifact = {
  id: 'artifact_plot',
  session_id: 'session_1',
  name: 'MTA1_east_north_up.png',
  media_type: 'image/png',
  uri: 'artifact://artifact_plot',
};

describe('buildArtifactLineageGraph', () => {
  it('preserves every relationship while allocating readable node and edge space', () => {
    const lineage: ArtifactLineage = {
      root: 'artifact_plot',
      direction: 'both',
      depth: 5,
      nodes: [
        {
          id: 'activity_stage',
          type: 'activity',
          tool: 'ndp_stage_resource_with_authoritative_provenance',
          status: 'success',
        },
        {
          id: 'artifact_csv',
          type: 'artifact',
          name: 'MTA1.CI.LY_30.csv',
          version: 1,
        },
        {
          id: 'activity_plot',
          type: 'activity',
          tool: 'plot_timeseries',
          status: 'success',
        },
        {
          id: 'artifact_plot',
          type: 'artifact',
          name: 'MTA1_east_north_up.png',
          version: 1,
        },
      ],
      edges: [
        {
          from: 'activity_stage',
          to: 'artifact_csv',
          type: 'generated',
          evidence: 'tool-observed source declaration',
        },
        { from: 'artifact_csv', to: 'activity_plot', type: 'used', evidence: 'hash-pair' },
        {
          from: 'activity_plot',
          to: 'artifact_plot',
          type: 'generated',
          evidence: 'tool-observed plot output',
        },
      ],
    };

    const graph = buildArtifactLineageGraph(artifact, lineage);

    expect(graph.nodes).toHaveLength(lineage.nodes.length);
    expect(graph.edges).toHaveLength(lineage.edges.length);
    expect(graph.nodes.find((node) => node.id === 'activity_stage')?.data.width).toBeGreaterThan(
      184,
    );
    expect(graph.nodes.every((node) => Number.isFinite(node.position.x))).toBe(true);
    expect(graph.edges[0]?.label).toBe('Generated — tool-observed source declaration');
    expect(graph.edges[0]?.labelStyle).toMatchObject({ fill: 'var(--popover-foreground)' });
    expect(graph.edges[0]?.style).toMatchObject({ strokeWidth: 1.5 });
  });
});
