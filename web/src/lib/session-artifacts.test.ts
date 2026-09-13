import type { ArtifactRecord } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { sessionArtifactEntities, sessionArtifactVersionEntities } from './session-artifacts';

function record(id: string, name: string): ArtifactRecord {
  return {
    workspace_id: 'workspace_1',
    name,
    kind: 'dataset',
    latest_version: 1,
    head_artifact_id: id,
    aliases: { latest: 1 },
    versions: [
      {
        artifact_id: id,
        workspace_id: 'workspace_1',
        name,
        version: 1,
        kind: 'dataset',
        custody: 'cas',
        mechanism: 'tool-schema',
        evidence_class: 'hashed-at-use',
        created_at: '2026-08-24T00:00:00Z',
        producer: {},
        uri: `artifact://workspace_1/${name}@v1`,
        fetch_url: `/v1/artifacts/${id}/bytes`,
      },
    ],
  };
}

describe('sessionArtifactEntities', () => {
  it('retains every immutable version for transcript links while the asset list shows the head', () => {
    const first = record('report_v1', 'report.md');
    const second = record('report_v2', 'report.md');
    second.latest_version = 2;
    second.versions[0].version = 2;
    second.versions[0].uri = 'artifact://workspace_1/report.md@v2';
    second.versions.unshift(first.versions[0]);
    const listing = {
      artifacts: [second],
      used: [],
      count: 1,
      include_children: true,
      child_session_ids: [],
    };
    expect(sessionArtifactEntities(listing, [], 'session_1').map((item) => item.id)).toEqual([
      'report_v2',
    ]);
    expect(sessionArtifactVersionEntities(listing, 'session_1')).toMatchObject([
      {
        id: 'report_v1',
        fetch_path: '/v1/artifacts/report_v1/bytes',
        uri: 'artifact://workspace_1/report.md@v1',
      },
      {
        id: 'report_v2',
        fetch_path: '/v1/artifacts/report_v2/bytes',
        uri: 'artifact://workspace_1/report.md@v2',
      },
    ]);
  });
  it('keeps produced outputs before used inputs and deduplicates transcript projections', () => {
    const result = sessionArtifactEntities(
      {
        artifacts: [record('report_1', 'report.md')],
        used: [record('input_1', 'input.csv')],
        count: 1,
        include_children: true,
        child_session_ids: [],
      },
      [
        {
          id: 'legacy_report',
          session_id: 'session_1',
          workspace_id: 'workspace_1',
          name: 'report.md',
          media_type: 'text/markdown',
          uri: 'artifact://legacy/report.md',
        },
      ],
      'session_1',
    );

    expect(result).toMatchObject([
      { id: 'report_1', media_type: 'text/markdown', session_relation: 'produced' },
      { id: 'input_1', media_type: 'text/csv', session_relation: 'used' },
    ]);
  });

  it('keeps registry custody when a transcript projection omits its workspace id', () => {
    const result = sessionArtifactEntities(
      {
        artifacts: [record('plot_1', 'vertical-displacement.png')],
        used: [],
        count: 1,
        include_children: true,
        child_session_ids: [],
      },
      [
        {
          id: 'plot_1',
          session_id: 'session_1',
          name: 'vertical-displacement.png',
          media_type: 'image/png',
          uri: 'artifact://workspace_1/vertical-displacement.png@v1',
        },
      ],
      'session_1',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'plot_1',
      fetch_path: '/v1/artifacts/plot_1/bytes',
      workspace_id: 'workspace_1',
    });
  });
});
