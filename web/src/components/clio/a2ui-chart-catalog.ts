import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createElement, lazy, Suspense } from 'react';
import { z } from 'zod';
import guardRules from './chart-assets/guard_rules.json';
import type { ChartDataQuery, ChartRow } from './chart-data';
import { checkChartSpecSchemaRules } from './chart-spec-guard';
import { BoundDataQuery } from './bound-data-query';
import { dataQuerySchema, fieldNameSchema } from './data-query-schema';
import { isBoundToPath, type SelectionWriter } from './selection-state';
import { geoJsonGeometrySchema } from './table-query-rows';

// vega, vega-lite and vega-embed are only fetched once a surface contains a chart.
const LazyChart = lazy(() =>
  import('./a2ui-chart').then((module) => ({ default: module.ClioChart })),
);

const fieldName = fieldNameSchema;
// `$defs/DataQuery` (`data-query-schema.ts`): shared verbatim by
// clio.chart.v1, clio.map.v1, and clio.data-table.v1 — never redefined here.
const chartDataQuerySchema = dataQuerySchema;

const PRESET_NAMES = guardRules.presets as [string, ...string[]];
const X_TYPES = guardRules.xTypes as [string, ...string[]];

const chartShape = {
  // The full guard (#1549 G4 review): agrees with the server's JSON Schema
  // on the top-level key allowlist AND the deep url/usermeta/data/
  // bind.element rules, instead of only the shallow top-level-key check —
  // a spec the server's $defs/SpecNoForbiddenKeys etc. would reject (e.g.
  // `data: {url: ...}` nested under `layer`) must fail here too.
  spec: z
    .record(z.unknown())
    .refine((spec) => checkChartSpecSchemaRules(spec).length === 0, {
      message: 'spec fails the chart spec guard (see checkChartSpec for the violation codes)',
    })
    .optional(),
  preset: z.enum(PRESET_NAMES).optional(),
  xField: fieldName.optional(),
  yField: fieldName.optional(),
  entityField: fieldName.optional(),
  colorField: fieldName.optional(),
  facetField: fieldName.optional(),
  xType: z.enum(X_TYPES).optional(),
  // A cell is a scalar OR a strictly-shaped GeoJSON Geometry object (#1549
  // G4 — a geoshape mark can then draw real shapes from inline rows).
  data: z
    .array(
      z.record(z.union([z.string(), z.number(), z.boolean(), z.null(), geoJsonGeometrySchema])),
    )
    .max(guardRules.maxInlineRows)
    .optional(),
  dataUri: z
    .string()
    .regex(/^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u)
    .optional(),
  dataQuery: chartDataQuerySchema.optional(),
  selection: CommonSchemas.DynamicValue.optional(),
  selectionParam: z.string().regex(new RegExp(guardRules.selectionParamPattern, 'u')).optional(),
  selectionField: fieldName.optional(),
  title: CommonSchemas.DynamicString.optional(),
  height: z.number().min(80).max(2000).optional(),
  accessibility: CommonSchemas.AccessibilityAttributes.optional(),
  weight: z.number().optional(),
};

const PRESET_FILL_FIELDS = [
  'xField',
  'yField',
  'entityField',
  'colorField',
  'facetField',
  'xType',
] as const;

/**
 * The fill fields each preset requires, and those it refuses — the catalog's
 * per-preset `if/then` rules (and the preset templates' `requiredFields` /
 * `optionalFields`, which `a2ui-chart.test.ts` checks this table against).
 */
export const CHART_PRESET_FIELD_RULES: Record<
  string,
  { required: readonly string[]; forbidden: readonly string[] }
> = {
  trajectories: { required: ['xField', 'yField', 'entityField'], forbidden: [] },
  heatmap: { required: ['xField', 'yField', 'colorField', 'entityField'], forbidden: [] },
  spectra: { required: ['xField', 'yField', 'entityField'], forbidden: [] },
  boxplot: { required: ['xField', 'yField', 'entityField'], forbidden: ['facetField', 'xType'] },
  scatter: { required: ['xField', 'yField', 'entityField'], forbidden: [] },
};

type ChartShape = z.infer<z.ZodObject<typeof chartShape>>;

/** The catalog's `oneOf`/`dependentRequired`/`if-then` rules for `clio.chart.v1`. */
function checkChartComponent(value: ChartShape, context: z.RefinementCtx): void {
  const has = (key: keyof ChartShape) => value[key] !== undefined;
  if (has('spec')) {
    const presetKeys = ['preset', ...PRESET_FILL_FIELDS].filter((key) =>
      has(key as keyof ChartShape),
    );
    if (presetKeys.length) {
      context.addIssue({
        code: 'custom',
        message: `A spec chart cannot also set ${presetKeys.join(', ')}`,
      });
    }
  } else if (!has('preset')) {
    context.addIssue({ code: 'custom', message: 'Provide exactly one of spec or preset' });
  }
  if (has('data') === has('dataUri')) {
    context.addIssue({ code: 'custom', message: 'Provide exactly one of data or dataUri' });
  }
  if (has('dataQuery') && !has('dataUri')) {
    context.addIssue({ code: 'custom', message: 'dataQuery needs dataUri' });
  }
  const rules = value.preset ? CHART_PRESET_FIELD_RULES[value.preset] : undefined;
  if (rules) {
    const missing = rules.required.filter((key) => !has(key as keyof ChartShape));
    if (missing.length) {
      context.addIssue({
        code: 'custom',
        message: `The ${value.preset} preset needs ${missing.join(', ')}`,
      });
    }
    const refused = rules.forbidden.filter((key) => has(key as keyof ChartShape));
    if (refused.length) {
      context.addIssue({
        code: 'custom',
        message: `The ${value.preset} preset does not use ${refused.join(', ')}`,
      });
    }
  }
}

/**
 * Zod mirror of `clio.chart.v1` (clio-schemas 0.5.0), cross-field rules included.
 *
 * The generic binder (`@a2ui/web_core` `scrapeSchemaBehavior`) only finds
 * DynamicValue props — and so only creates `setSelection` — under a top-level
 * `ZodObject`; `.superRefine()` would hand it a `ZodEffects` and silently drop
 * every binding. So the exported schema stays a `ZodObject` for the binder,
 * and its parse runs through a refined twin built from the same shape.
 */
export const chartComponentSchema = z.object(chartShape).strict();
const refinedChartComponentSchema = z.object(chartShape).strict().superRefine(checkChartComponent);
Object.defineProperty(chartComponentSchema, '_parse', {
  value: (input: z.ParseInput) => refinedChartComponentSchema._parse(input),
});

/** Protocol adapter for `clio.chart.v1`; the Vega renderer loads on first use. */
export const ClioChartCatalogComponent = createComponentImplementation(
  { name: 'clio.chart.v1', schema: chartComponentSchema },
  ({ props, context }) =>
    createElement(
      BoundDataQuery,
      {
        dataContext: context.dataContext,
        query: props.dataQuery as ChartDataQuery | undefined,
        // This catalog adapter is a .ts file and passes a render function as children.
        // oxlint-disable-next-line react/no-children-prop
        children: (resolvedQuery: ChartDataQuery | undefined) => createElement(
          Suspense,
          { fallback: createElement('div', { className: 'h-80 animate-pulse rounded-lg bg-muted' }) },
          createElement(LazyChart, {
        accessibility: props.accessibility,
        colorField: props.colorField,
        componentId: context.componentModel.id,
        data: props.data as ChartRow[] | undefined,
        dataQuery: resolvedQuery,
        dataUri: props.dataUri,
        entityField: props.entityField,
        facetField: props.facetField,
        height: props.height,
        preset: props.preset,
        // The binder resolves `selection` and writes back only when it is bound to a path.
        selection: props.selection,
        selectionField: props.selectionField,
        selectionParam: props.selectionParam,
        setSelection: isBoundToPath(context.componentModel.properties.selection)
          ? (props.setSelection as unknown as SelectionWriter)
          : undefined,
        spec: props.spec,
        title: props.title,
        weight: props.weight,
        xField: props.xField,
        xType: props.xType,
        yField: props.yField,
          }),
        ),
      },
    ),
);
