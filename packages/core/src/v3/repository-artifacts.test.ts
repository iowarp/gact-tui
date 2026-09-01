import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';

describe('ClioRepository artifact contracts', () => {
  it('loads artifact history and lineage and exports an evidence crate', async () => {
    const version = {
      artifact_id: 'artifact_1',
      workspace_id: 'ws_1',
      name: 'result.csv',
      version: 1,
      kind: 'data',
      custody: 'cas',
      mechanism: 'tool-declared',
      evidence_class: 'strong',
      sha256: 'abc',
      size_bytes: 12,
      authority: 'tool',
      path: 'result.csv',
      created_at: '2026-08-23T00:00:00Z',
      producer: { session_id: 'sess_1', call_id: 'call_1' },
      uri: 'artifact://ws_1/result.csv@v1',
      fetch_url: '/v1/artifacts/artifact_1/bytes',
    };
    const detail = {
      artifact: {
        workspace_id: 'ws_1',
        name: 'result.csv',
        kind: 'data',
        latest_version: 1,
        head_artifact_id: 'artifact_1',
        aliases: { latest: 1 },
        versions: [version],
      },
      resolved: version,
    };
    const lineage = {
      root: 'artifact_1',
      direction: 'both',
      depth: 5,
      nodes: [
        { id: 'artifact_1', type: 'artifact', name: 'result.csv', version: 1 },
        { id: 'activity:call_1', type: 'activity', tool: 'Analyze data' },
      ],
      edges: [
        { from: 'activity:call_1', to: 'artifact_1', type: 'generated', evidence: 'declared' },
      ],
      truncated: null,
    };
    const bundle = new Uint8Array([80, 75, 3, 4]);
    const transport = new RecordingTransport([detail, lineage, bundle]);
    const repository = new ClioRepository(transport);

    await expect(repository.artifactDetail('artifact 1')).resolves.toMatchObject(detail);
    await expect(repository.artifactLineage('artifact 1')).resolves.toMatchObject({
      root: 'artifact_1',
      nodes: lineage.nodes,
      edges: lineage.edges,
    });
    await expect(repository.exportArtifact('artifact 1')).resolves.toEqual(bundle);
    expect(transport.requests.map(({ path, responseType }) => ({ path, responseType }))).toEqual([
      { path: '/v1/artifacts/artifact%201', responseType: undefined },
      {
        path: '/v1/artifacts/artifact%201/lineage?direction=both&depth=5',
        responseType: undefined,
      },
      { path: '/v1/artifacts/artifact%201/export', responseType: 'bytes' },
    ]);
  });

  it('walks the authoritative session artifact registry including child outputs and used inputs', async () => {
    const version = (id: string, name: string, sessionId: string) => ({
      artifact_id: id,
      workspace_id: 'ws_1',
      name,
      version: 1,
      kind: 'dataset',
      custody: 'cas',
      mechanism: 'tool-schema',
      evidence_class: 'hashed-at-use',
      created_at: '2026-08-24T00:00:00Z',
      producer: { session_id: sessionId },
      custody_gap: { reason: 'relink_by_hash' },
      uri: `artifact://ws_1/${name}@v1`,
      fetch_url: `/v1/artifacts/${id}/bytes`,
    });
    const record = (id: string, name: string, sessionId: string) => ({
      workspace_id: 'ws_1',
      name,
      kind: 'dataset',
      latest_version: 1,
      head_artifact_id: id,
      aliases: { latest: 1 },
      versions: [version(id, name, sessionId)],
      producing_session_ids: [sessionId],
    });
    const transport = new RecordingTransport([
      {
        artifacts: [record('artifact_plot', 'plot.png', 'child_1')],
        used: [record('artifact_csv', 'input.csv', 'source_1')],
        count: 2,
        include_children: true,
        child_session_ids: ['child_1'],
        next_cursor: 'artifact_plot',
      },
      {
        artifacts: [record('artifact_report', 'report.md', 'sess_1')],
        used: [record('artifact_csv', 'input.csv', 'source_1')],
        count: 2,
        include_children: true,
        child_session_ids: ['child_1'],
        next_cursor: null,
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.sessionArtifacts('sess 1')).resolves.toMatchObject({
      artifacts: [{ name: 'plot.png' }, { name: 'report.md' }],
      used: [{ name: 'input.csv' }],
      count: 2,
      include_children: true,
      child_session_ids: ['child_1'],
    });
    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/v1/sessions/sess%201/artifacts?include_children=true&include_used=true&limit=200',
      '/v1/sessions/sess%201/artifacts?include_children=true&include_used=true&limit=200&before=artifact_plot',
    ]);
  });
});
