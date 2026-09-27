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

/** A JSON scalar a table-query filter compares against. */
export type TableQueryScalar = string | number | boolean;

/**
 * One table-query predicate; all of a request's predicates are AND-ed.
 * `eq`: a scalar. `in`: a non-empty scalar list. `range`: `[min, max]`,
 * inclusive, either side null. `isnull`: omitted/`true` matches nulls,
 * `false` non-nulls.
 */
export type TableQueryFilter =
  | { column: string; op: 'eq'; value: TableQueryScalar }
  | { column: string; op: 'in'; value: readonly TableQueryScalar[] }
  | {
      column: string;
      op: 'range';
      value: readonly [TableQueryScalar | null, TableQueryScalar | null];
    }
  | { column: string; op: 'isnull'; value?: boolean | null };

export type TableQueryMetricFn = 'mean' | 'min' | 'max' | 'count' | 'sum' | 'median';

/** Group by `groupBy` (empty: one group) and reduce; each metric is a column `{column}_{fn}`. */
export interface TableQueryAggregate {
  groupBy?: readonly string[];
  metrics: readonly { column: string; fn: TableQueryMetricFn }[];
}

/** How the server thins rows before the limit; `per_entity_lttb` needs `x` and `y`. */
export interface TableQueryDownsample {
  mode?: 'none' | 'stride' | 'per_entity_lttb';
  entityColumn?: string;
  x?: string;
  y?: string;
  maxPerEntity?: number;
}

/**
 * `POST /v1/artifacts/{id}/table-query` request (clio-agent
 * `TableQueryRequest`, which clio-schemas' `$defs/ChartDataQuery` mirrors):
 * a projection, AND-ed filters, an optional aggregate and downsample, and the
 * row budget the caller will accept. `format` is always `json`, added here.
 */
export interface ArtifactTableQueryRequest {
  columns: readonly string[];
  filter?: readonly TableQueryFilter[];
  aggregate?: TableQueryAggregate;
  downsample?: TableQueryDownsample;
  limit: number;
}

const tableQueryValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const artifactTableQuerySchema = z
  .object({
    artifact_id: z.string().optional(),
    schema: z.array(z.object({ name: z.string(), type: z.string() }).passthrough()),
    columns: z.record(z.array(tableQueryValueSchema)),
    totalRows: z.number().int().nonnegative(),
    matchedRows: z.number().int().nonnegative().optional(),
    returnedRows: z.number().int().nonnegative(),
    truncated: z.boolean(),
    downsample: z.object({ mode: z.string() }).passthrough(),
  })
  .passthrough()
  .superRefine((value, context) => {
    for (const [name, values] of Object.entries(value.columns)) {
      if (values.length !== value.returnedRows) {
        context.addIssue({
          code: 'custom',
          message: `column ${name} does not match the returned row count`,
        });
      }
    }
  });

/** A columnar slice of a registered table: one array per column, all `returnedRows` long. */
export type ArtifactTableQueryResult = z.infer<typeof artifactTableQuerySchema>;

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

  /** Filter → aggregate → downsample → limit over a registered CSV/Parquet artifact. */
  public artifactTableQuery(
    artifactId: string,
    query: ArtifactTableQueryRequest,
    signal?: AbortSignal,
  ): Promise<ArtifactTableQueryResult> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/table-query`,
      body: { ...query, format: 'json' },
      decode: (value) => {
        const result = artifactTableQuerySchema.parse(value);
        if (result.artifact_id !== undefined && result.artifact_id !== artifactId) {
          throw new Error('Artifact table query identity did not match the requested artifact.');
        }
        if (result.returnedRows > query.limit) {
          throw new Error('Artifact table query exceeded the requested row limit.');
        }
        return result;
      },
      signal,
    });
  }
}
