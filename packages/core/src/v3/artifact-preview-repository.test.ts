import { describe, expect, it, vi } from 'vitest';
import { ArtifactPreviewRepository } from './artifact-preview-repository.js';
import type { ClioTransport, TransportRequest } from './transport.js';

describe('ArtifactPreviewRepository', () => {
  it('requests and decodes a bounded selected-column preview', async () => {
    const request = vi.fn(async (input: TransportRequest<unknown>) =>
      input.decode({
        artifact_id: 'artifact csv',
        name: 'positions.csv',
        columns: ['time', 'east', 'north'],
        rows: [{ time: '0', east: '-0.1', north: null }],
        total_rows: 250_000,
        sampled_rows: 1,
        truncated: true,
      }),
    );
    const transport = { request, stream: vi.fn() } as unknown as ClioTransport;
    const repository = new ArtifactPreviewRepository(transport);

    await expect(
      repository.artifactTablePreview('artifact csv', ['time', 'east', 'north']),
    ).resolves.toMatchObject({ artifact_id: 'artifact csv', total_rows: 250_000 });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/v1/artifacts/artifact%20csv/table-preview?columns=time%2Ceast%2Cnorth&limit=1000',
      }),
    );
  });

  it('refuses a preview whose artifact identity does not match the request', async () => {
    const request = vi.fn(async (input: TransportRequest<unknown>) =>
      input.decode({
        artifact_id: 'artifact_other',
        name: 'positions.csv',
        columns: ['time'],
        rows: [],
        total_rows: 0,
        sampled_rows: 0,
        truncated: false,
      }),
    );
    const transport = { request, stream: vi.fn() } as unknown as ClioTransport;
    const repository = new ArtifactPreviewRepository(transport);

    await expect(repository.artifactTablePreview('artifact_csv', ['time'])).rejects.toThrow(
      'Artifact preview identity did not match',
    );
  });

  it('posts a bounded table query and decodes the columnar result', async () => {
    const request = vi.fn(async (input: TransportRequest<unknown>) =>
      input.decode({
        artifact_id: 'artifact_runs',
        name: 'runs.parquet',
        schema: [
          { name: 't', type: 'double' },
          { name: 'run', type: 'string' },
        ],
        columns: { t: [0, 1], run: ['a', 'a'] },
        totalRows: 360_000,
        matchedRows: 1_000,
        returnedRows: 2,
        truncated: true,
        downsample: { mode: 'per_entity_lttb', inputRows: 1_000 },
        cached: false,
      }),
    );
    const transport = { request, stream: vi.fn() } as unknown as ClioTransport;
    const repository = new ArtifactPreviewRepository(transport);

    await expect(
      repository.artifactTableQuery('artifact_runs', {
        columns: ['t', 'run'],
        filter: [{ column: 'run', op: 'in', value: ['a'] }],
        limit: 50,
      }),
    ).resolves.toMatchObject({ returnedRows: 2, truncated: true, columns: { run: ['a', 'a'] } });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/artifacts/artifact_runs/table-query',
        body: {
          columns: ['t', 'run'],
          filter: [{ column: 'run', op: 'in', value: ['a'] }],
          limit: 50,
          format: 'json',
        },
      }),
    );
  });

  it('refuses a table query whose columns disagree with the returned row count', async () => {
    const request = vi.fn(async (input: TransportRequest<unknown>) =>
      input.decode({
        schema: [{ name: 't', type: 'double' }],
        columns: { t: [0, 1, 2] },
        totalRows: 3,
        returnedRows: 2,
        truncated: false,
        downsample: { mode: 'none' },
      }),
    );
    const transport = { request, stream: vi.fn() } as unknown as ClioTransport;
    const repository = new ArtifactPreviewRepository(transport);

    await expect(
      repository.artifactTableQuery('artifact_runs', { columns: ['t'], limit: 10 }),
    ).rejects.toThrow('does not match the returned row count');
  });

  it('refuses a table query that returns more rows than the requested limit', async () => {
    const request = vi.fn(async (input: TransportRequest<unknown>) =>
      input.decode({
        schema: [{ name: 't', type: 'double' }],
        columns: { t: [0, 1, 2] },
        totalRows: 3,
        returnedRows: 3,
        truncated: false,
        downsample: { mode: 'none' },
      }),
    );
    const transport = { request, stream: vi.fn() } as unknown as ClioTransport;
    const repository = new ArtifactPreviewRepository(transport);

    await expect(
      repository.artifactTableQuery('artifact_runs', { columns: ['t'], limit: 2 }),
    ).rejects.toThrow('exceeded the requested row limit');
  });
});
