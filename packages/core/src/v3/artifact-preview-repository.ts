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
 * `false` non-nulls. `contains`: a case-insensitive substring match — the
 * data-table's own text column filter.
 */
export type TableQueryFilter =
  | { column: string; op: 'eq'; value: TableQueryScalar }
  | { column: string; op: 'in'; value: readonly TableQueryScalar[] }
  | {
      column: string;
      op: 'range';
      value: readonly [TableQueryScalar | null, TableQueryScalar | null];
    }
  | { column: string; op: 'isnull'; value?: boolean | null }
  | { column: string; op: 'contains'; value: string };

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
 * One sort key — the viewer's click-to-sort headers, or the producer's own
 * choice. `sort` is a LIST of these (clio-agent `TableQueryRequest.sort:
 * list[TableSort]`, `TableSort {column, desc: bool}`): multiple keys apply in
 * order for a stable, compound sort, though the table UI drives at most one
 * at a time. `desc`, not `direction`, matches the wire contract exactly.
 */
export interface TableQuerySort {
  column: string;
  desc: boolean;
}

/**
 * `POST /v1/artifacts/{id}/table-query` request (clio-agent
 * `TableQueryRequest`, which clio-schemas' `$defs/DataQuery` mirrors):
 * a projection, AND-ed filters, an optional aggregate, downsample, sort,
 * offset and the row budget the caller will accept. `format` is always
 * `json`, added here.
 * `columns` is optional: an omitted projection asks the server for every
 * column of the referenced table (bounded by `limit`); the schema still
 * requires it whenever `aggregate` is set, since a group-by/metric shape
 * cannot be inferred. `offset` pages through a dataset larger than one
 * response — rows go to the table viewer, never the agent, so `limit` is a
 * per-response transfer guard, not a cap on what the dataset holds.
 */
export interface ArtifactTableQueryRequest {
  columns?: readonly string[];
  filter?: readonly TableQueryFilter[];
  aggregate?: TableQueryAggregate;
  downsample?: TableQueryDownsample;
  sort?: readonly TableQuerySort[];
  offset?: number;
  limit: number;
}

const tableQueryValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
/**
 * The stable server row key (G0: "views over the SAME dataUri link
 * automatically, through a stable server row key"): one value per returned
 * row, ordered and sized exactly like `columns`. Absent when the query
 * aggregated (grouped rows have no single source row to key by).
 */
const rowKeySchema = z.object({
  column: z.string(),
  values: z.array(z.union([z.string(), z.number()])),
});
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
    rowKey: rowKeySchema.optional(),
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

const artifactRasterQuerySchema = z.object({
  width: z.number().int().min(1).max(1024),
  height: z.number().int().min(1).max(1024),
  extent: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  sourceBounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  sourceShape: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  xLabel: z.string(), yLabel: z.string(),
  min: z.number().nullable(), max: z.number().nullable(),
  values: z.array(z.number().nullable()),
}).superRefine((value, context) => {
  if (value.values.length !== value.width * value.height) {
    context.addIssue({ code: 'custom', message: 'Raster sample count does not match its dimensions.' });
  }
});

export type ArtifactRasterQueryResult = z.infer<typeof artifactRasterQuerySchema>;
export interface ArtifactRasterQueryRequest {
  width: number;
  height: number;
  extent?: readonly [number, number, number, number];
  variable?: string;
  band?: number;
}

/**
 * `POST /v1/artifacts/{id}/table-export` request (clio-agent
 * `TableExportRequest`): the same filter/aggregate/downsample/sort shape as
 * a table-query, plus which download format to serialize and whether to
 * export the current (filtered/sorted) view or the full, unfiltered
 * dataset. G0 (built-in data-view affordances): the download/export menu on
 * every `dataUri` chart/map/table is driven by this, never by agent code.
 */
export interface ArtifactTableExportRequest {
  columns?: readonly string[];
  filter?: readonly TableQueryFilter[];
  aggregate?: TableQueryAggregate;
  downsample?: TableQueryDownsample;
  sort?: readonly TableQuerySort[];
  scope: 'current' | 'full';
  format: 'csv' | 'json' | 'parquet';
}

/** Bounded structured previews for immutable registered artifacts. */
export class ArtifactPreviewRepository extends ProviderRepository {
  /** Read a bounded sample of the visible extent of a registered grid. */
  public artifactRasterQuery(artifactId: string, query: ArtifactRasterQueryRequest, signal?: AbortSignal): Promise<ArtifactRasterQueryResult> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/raster-query`,
      body: query,
      decode: (value) => artifactRasterQuerySchema.parse(value),
      signal,
    });
  }

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

  /** The current view or full dataset of a registered CSV/Parquet artifact, serialized for download. */
  public artifactTableExport(
    artifactId: string,
    query: ArtifactTableExportRequest,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/table-export`,
      body: query,
      responseType: 'bytes',
      decode: (value) => {
        if (!(value instanceof Uint8Array)) throw new TypeError('Expected a binary response');
        return value;
      },
      signal,
    });
  }
}
