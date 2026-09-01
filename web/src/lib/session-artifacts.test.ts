import type { ArtifactRecord } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { sessionArtifactEntities } from './session-artifacts';

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
});
