import { categoryColor } from './category-colors';
import { isJsonObject } from './chart-spec-guard';

type CategoryValue = string | number | boolean;
export type ChartCategoryDomains = Record<string, CategoryValue[]>;
const CHILD_VIEWS = ['layer', 'concat', 'hconcat', 'vconcat'] as const;

function automaticColorField(spec: Record<string, unknown>): string | undefined {
  const color = isJsonObject(spec.encoding) ? spec.encoding.color : undefined;
  if (!isJsonObject(color) || color.type !== 'nominal' || typeof color.field !== 'string') return;
  if (color.scale === null || color.aggregate || color.bin) return;
  const scale = isJsonObject(color.scale) ? color.scale : {};
  if (['range', 'scheme', 'rangeMin', 'rangeMax'].some((key) => key in scale)) return;
  // A declared domain is also an authored scale: retain it, including absent categories.
  if ('domain' in scale) return;
  return color.field;
}

function hasAuthoredPalette(spec: Record<string, unknown>): boolean {
  const config = isJsonObject(spec.config) ? spec.config : undefined;
  return Boolean(config && isJsonObject(config.range) && 'category' in config.range);
}

/** Collect only automatic nominal domains; calculated/aggregate fields remain Vega's responsibility. */
export function chartCategoryDomains(
  spec: Record<string, unknown>,
  rows: readonly Record<string, unknown>[],
): ChartCategoryDomains {
  const domains: ChartCategoryDomains = Object.create(null);
  if (hasAuthoredPalette(spec)) return domains;
  const visit = (node: Record<string, unknown>) => {
    const field = automaticColorField(node);
    if (field && !domains[field]) {
      const values = rows
        .map((row) => row[field])
        .filter(
          (value): value is CategoryValue =>
            typeof value === 'string' ||
            typeof value === 'boolean' ||
            (typeof value === 'number' && Number.isFinite(value)),
        );
      if (values.length)
        domains[field] = [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
    }
    for (const key of CHILD_VIEWS) {
      if (Array.isArray(node[key]))
        for (const child of node[key]) if (isJsonObject(child)) visit(child);
    }
    if (isJsonObject(node.spec)) visit(node.spec);
  };
  visit(spec);
  return domains;
}

/** Bind default chart colours to the same identities as maps; preserve every authored scale and mark. */
export function withChartCategoryColors(
  spec: Record<string, unknown>,
  domains: ChartCategoryDomains,
): Record<string, unknown> {
  if (!Object.keys(domains).length || hasAuthoredPalette(spec)) return spec;
  const visit = (node: Record<string, unknown>): Record<string, unknown> => {
    const result = { ...node };
    const field = automaticColorField(node);
    if (field && domains[field]) {
      const encoding = node.encoding as Record<string, unknown>;
      const color = encoding.color as Record<string, unknown>;
      result.encoding = {
        ...encoding,
        color: {
          ...color,
          scale: {
            ...(isJsonObject(color.scale) ? color.scale : {}),
            domain: domains[field],
            range: domains[field].map(categoryColor),
          },
        },
      };
    }
    for (const key of CHILD_VIEWS) {
      if (Array.isArray(node[key]))
        result[key] = node[key].map((child) => (isJsonObject(child) ? visit(child) : child));
    }
    if (isJsonObject(node.spec)) result.spec = visit(node.spec);
    return result;
  };
  return visit(spec);
}
