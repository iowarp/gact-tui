import { z } from 'zod';
import { ProviderRepository } from './provider-repository.js';

const previewValueSchema = z.union([z.string(), z.null()]);
const artifactTablePreviewSchema = z.object({
  artifact_id: z.string(),
  name: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.record(previewValueSchema)),
  total_rows: z.number().int().nonnegative(),
  sampled_rows: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export type ArtifactTablePreview = z.infer<typeof artifactTablePreviewSchema>;

/** Bounded structured previews for immutable registered artifacts. */
export class ArtifactPreviewRepository extends ProviderRepository {
  public artifactTablePreview(
    artifactId: string,
    columns: readonly string[],
    limit = 1_000,
    signal?: AbortSignal,
  ): Promise<ArtifactTablePreview> {
    const query = new URLSearchParams({
      columns: columns.join(','),
      limit: String(limit),
    });
    return this.transport.request({
      method: 'GET',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/table-preview?${query.toString()}`,
      decode: (value) => artifactTablePreviewSchema.parse(value),
      signal,
    });
  }
}
