import { describe, expect, it, vi } from 'vitest';
import { ArtifactPreviewRepository } from './artifact-preview-repository.js';
import type { ClioTransport, TransportRequest } from './transport.js';

describe('ArtifactPreviewRepository', () => {
  it('requests and decodes a bounded selected-column preview', async () => {
    const request = vi.fn(async (input: TransportRequest<unknown>) =>
      input.decode({
        artifact_id: 'artifact_csv',
        name: 'positions.csv',
        columns: ['time', 'east', 'north'],
        rows: [{ time: '0', east: '-0.1', north: null }],
        total_rows: 250_000,
        sampled_rows: 1_000,
        truncated: true,
      }),
    );
    const transport = { request, stream: vi.fn() } as unknown as ClioTransport;
    const repository = new ArtifactPreviewRepository(transport);

    await expect(
      repository.artifactTablePreview('artifact csv', ['time', 'east', 'north']),
    ).resolves.toMatchObject({ artifact_id: 'artifact_csv', total_rows: 250_000 });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/v1/artifacts/artifact%20csv/table-preview?columns=time%2Ceast%2Cnorth&limit=1000',
      }),
    );
  });
});
