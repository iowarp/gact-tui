import type { ChartAxisType } from './chart-box-selection';
import type { ChartRow } from './chart-data';

/** Vega stamps its own id onto each tuple, so it gets copies, never the data model's rows. */
export function cloneRows(rows: readonly ChartRow[]): ChartRow[] {
  return rows.map((row) => ({ ...row }));
}

export function chartAxisType(
  spec: Record<string, unknown> | undefined,
  channel: 'x' | 'y',
): ChartAxisType | undefined {
  if (!spec) return undefined;
  const nested = ['layer', 'concat', 'hconcat', 'vconcat'].find((key) => Array.isArray(spec[key]));
  if (nested) {
    const first = (spec[nested] as unknown[])[0];
    return first && typeof first === 'object'
      ? chartAxisType(first as Record<string, unknown>, channel)
      : undefined;
  }
  const encoding = spec.encoding;
  if (!encoding || typeof encoding !== 'object') return undefined;
  const definition = (encoding as Record<string, unknown>)[channel];
  if (!definition || typeof definition !== 'object') return undefined;
  const type = (definition as Record<string, unknown>).type;
  return type === 'quantitative' || type === 'temporal' || type === 'nominal' || type === 'ordinal'
    ? type
    : undefined;
}

export function isContinuousAxis(type: ChartAxisType | undefined): boolean {
  return type !== 'nominal' && type !== 'ordinal';
}

export function describeChart(
  spec: Record<string, unknown> | undefined,
  rows: readonly ChartRow[] | undefined,
  loading: boolean,
  note: string,
): string {
  if (loading) return 'Loading rows…';
  const summary = spec && typeof spec.description === 'string' ? spec.description : '';
  const count = rows ? `${rows.length.toLocaleString()} rows` : '';
  return [summary, count].filter(Boolean).join(' · ') || (note ? note : 'No rows');
}
