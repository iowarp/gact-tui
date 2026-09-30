import { z } from 'zod';

/**
 * The zod mirror of clio-schemas' shared `$defs/FieldName` and
 * `$defs/DataQuery` — the server-side table query every tabular A2UI
 * component (`clio.chart.v1`, `clio.map.v1`, `clio.data-table.v1`) accepts
 * alongside `dataUri`. One shape, `$ref`'d by all three on the wire; this
 * module is the one place it is defined on the client too
 * (`a2ui-component-design` skill, rule 1 and rule 5).
 */

/** `$defs/FieldName`: a dataset column name. */
export const fieldNameSchema = z.string().min(1).max(128);

const distinct = (values: readonly unknown[]) =>
  new Set(values.map((value) => JSON.stringify(value))).size === values.length;
const queryScalar = z.union([z.string(), z.number(), z.boolean()]);

/**
 * `$defs/QueryFilter`: one predicate whose `value` rule depends on `op`. All
 * filter entries are AND-ed together. `contains` is a case-insensitive
 * substring match — the data-table's own text column filter, layered on top
 * of (never replacing) the producer's own filters.
 */
export const queryFilterSchema = z
  .object({
    column: fieldNameSchema,
    op: z.enum(['eq', 'in', 'range', 'isnull', 'contains']),
    value: z.unknown().optional(),
  })
  .strict()
  .superRefine(({ op, value }, context) => {
    const valueRule = {
      eq: queryScalar,
      in: z.array(queryScalar).min(1).max(10_000),
      range: z.tuple([queryScalar.nullable(), queryScalar.nullable()]),
      isnull: z.boolean().nullable().optional(),
      contains: z.string().min(1),
    }[op];
    if (!valueRule.safeParse(value).success) {
      context.addIssue({ code: 'custom', path: ['value'], message: `Not a valid ${op} value` });
    }
  });

/** `$defs/QueryAggregate`; a metric's output column is `{column}_{fn}`. */
export const queryAggregateSchema = z
  .object({
    groupBy: z
      .array(fieldNameSchema)
      .max(64)
      .refine(distinct, 'groupBy repeats a column')
      .optional(),
    metrics: z
      .array(
        z
          .object({
            column: fieldNameSchema,
            fn: z.enum(['mean', 'min', 'max', 'count', 'sum', 'median']),
          })
          .strict(),
      )
      .min(1)
      .max(64)
      .refine(distinct, 'metrics repeat'),
  })
  .strict()
  .refine(
    ({ groupBy = [], metrics }) =>
      !metrics.some(({ column, fn }) => groupBy.includes(`${column}_${fn}`)),
    'A metric output name repeats a groupBy column',
  );

/**
 * `$defs/QueryDownsample`. `none` keeps every row; `stride` keeps evenly
 * spaced rows; `per_entity_lttb` keeps a visually representative subset per
 * `entityColumn`, needing `x`/`y`.
 */
export const queryDownsampleSchema = z
  .object({
    mode: z.enum(['none', 'stride', 'per_entity_lttb']).optional(),
    entityColumn: fieldNameSchema.optional(),
    x: fieldNameSchema.optional(),
    y: fieldNameSchema.optional(),
    maxPerEntity: z.number().int().min(1).max(2_000).optional(),
  })
  .strict()
  .refine(
    ({ mode, x, y }) => mode !== 'per_entity_lttb' || (x !== undefined && y !== undefined),
    'per_entity_lttb needs x and y',
  );

/** `$defs/QuerySort`: one column's order — a producer's base view, or the viewer's own click. */
export const querySortSchema = z
  .object({ column: fieldNameSchema, direction: z.enum(['asc', 'desc']) })
  .strict();

/**
 * `$defs/DataQuery`: the table-query server's request model (without
 * `format`), closed at every level, so a query that parses here is sent as
 * is. Shared verbatim by `clio.chart.v1`, `clio.map.v1`, and
 * `clio.data-table.v1` — the only three tabular components; never
 * duplicated per component. `columns` may be omitted: the server then
 * returns every column of the referenced table (bounded by `limit`) — except
 * alongside `aggregate`, whose group-by/metric shape cannot be inferred, so
 * `columns` is required there. `limit` bounds one response's transfer, never
 * what the dataset holds: `offset` pages through the rest of it.
 */
export const dataQuerySchema = z
  .object({
    columns: z.array(fieldNameSchema).min(1).max(64).refine(distinct, 'columns repeat').optional(),
    filter: z.array(queryFilterSchema).max(64).optional(),
    aggregate: queryAggregateSchema.optional(),
    downsample: queryDownsampleSchema.optional(),
    sort: querySortSchema.optional(),
    offset: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(50_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.aggregate && !value.columns) {
      context.addIssue({ code: 'custom', message: 'columns is required alongside aggregate' });
    }
  });
