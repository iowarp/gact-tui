import { z } from 'zod';
import { ProviderRepository } from './provider-repository.js';

/**
 * Rows requested when a caller does not name its own budget. Unit: rows.
 * Enough to plot or scan a table sample without pulling a whole dataset into
 * the client; the web surface carries the matching `PREVIEW_ROW_LIMIT`.
 */
const PREVIEW_ROW_LIMIT = 1_000;

const previewValueSchema = z.union([z.string(), z.null()]);
const artifactTablePreviewSchema = z
  .object({
    artifact_id: z.string(),
    name: z.string(),
    columns: z.array(z.string()),
    rows: z.array(z.record(previewValueSchema)),
    total_rows: z.number().int().nonnegative(),
    sampled_rows: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.sampled_rows !== value.rows.length) {
      context.addIssue({
        code: 'custom',
        message: 'sampled_rows does not match the returned row count',
      });
    }
    if (value.total_rows < value.sampled_rows) {
      context.addIssue({
        code: 'custom',
        message: 'total_rows is smaller than sampled_rows',
      });
    }
  });

export type ArtifactTablePreview = z.infer<typeof artifactTablePreviewSchema>;

/** Bounded structured previews for immutable registered artifacts. */
export class ArtifactPreviewRepository extends ProviderRepository {
  public artifactTablePreview(
    artifactId: string,
    columns: readonly string[],
    limit = PREVIEW_ROW_LIMIT,
    signal?: AbortSignal,
  ): Promise<ArtifactTablePreview> {
    const query = new URLSearchParams({
      columns: columns.join(','),
      limit: String(limit),
    });
    return this.transport.request({
      method: 'GET',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/table-preview?${query.toString()}`,
      decode: (value) => {
        const preview = artifactTablePreviewSchema.parse(value);
        if (preview.artifact_id !== artifactId) {
          throw new Error('Artifact preview identity did not match the requested artifact.');
        }
        if (preview.rows.length > limit) {
          throw new Error('Artifact preview exceeded the requested row limit.');
        }
        return preview;
      },
      signal,
    });
  }
}
