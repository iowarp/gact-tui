import type { ChartAxisType } from './chart-box-selection';
import { sourceColumn, type ChartRow } from './chart-data';
import { isJsonObject } from './chart-spec-guard';

/** Vega stamps its own id onto each tuple, so it gets copies, never the data model's rows. */
export function cloneRows(rows: readonly ChartRow[]): ChartRow[] {
  return rows.map((row) => ({ ...row }));
}

interface ChartUnit {
  encoding: Record<string, unknown>;
  mark: unknown;
}

function chartUnits(
  spec: Record<string, unknown>,
  inherited?: Record<string, unknown>,
): (ChartUnit | undefined)[] {
  // Separate plots have separate coordinate systems. Do not guess which one
  // the user's brush is addressing from the first child in a concatenation.
  if (['concat', 'hconcat', 'vconcat', 'repeat'].some((key) => key in spec)) return [undefined];
  const encoding = { ...inherited, ...(isJsonObject(spec.encoding) ? spec.encoding : {}) };
  if (Array.isArray(spec.layer)) {
    return spec.layer.flatMap((child) =>
      isJsonObject(child) ? chartUnits(child, encoding) : [undefined],
    );
  }
  if (isJsonObject(spec.spec)) return chartUnits(spec.spec, encoding);
  return [{ encoding, mark: isJsonObject(spec.mark) ? spec.mark.type : spec.mark }];
}

function chartChannelDefinitions(
  spec: Record<string, unknown>, channel: string,
): (Record<string, unknown> | undefined)[] {
  const units = chartUnits(spec);
  if (units.some((unit) => !unit)) return [undefined];
  const valid = units.filter((unit): unit is ChartUnit => Boolean(unit));
  // The brush selects chart points. Resolve their coordinates rather than a
  // reference rule, percentile band or median tick drawn in the same scales.
  // Multiple point/line layers must still agree; never pick an arbitrary field.
  const observations = valid.filter((unit) =>
    ['point', 'circle', 'square', 'line', 'trail'].includes(String(unit.mark)),
  );
  const selectable = observations.length ? observations : valid.filter((unit) => {
    if (unit.mark !== 'rule') return true;
    return ['x', 'y'].every((axis) => {
      const definition = unit.encoding[axis];
      return isJsonObject(definition) && typeof definition.field === 'string';
    });
  });
  return selectable.map((unit) => {
    const definition = unit.encoding[channel];
    return isJsonObject(definition) ? definition : undefined;
  });
}

/** Resolve an unambiguous authored encoding without requiring duplicate component fields. */
export function chartChannelField(
  spec: Record<string, unknown> | undefined,
  channel: 'x' | 'y' | 'color',
): string | undefined {
  if (!spec) return undefined;
  const fields = chartChannelDefinitions(spec, channel).map((definition) => definition?.field);
  if (!fields.length || fields.some((field) => typeof field !== 'string' || !field)) return;
  // A Vega-Lite field may escape a dotted column (`condition\\.n`); callers read rows by column.
  return new Set(fields).size === 1 ? sourceColumn(fields[0] as string) : undefined;
}

export function chartAxisType(
  spec: Record<string, unknown> | undefined,
  channel: 'x' | 'y',
): ChartAxisType | undefined {
  if (!spec) return undefined;
  const types = chartChannelDefinitions(spec, channel).map((definition) => definition?.type);
  if (!types.length || new Set(types).size !== 1) return undefined;
  const type = types[0];
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
  if (summary && count) return `${summary} (${count})`;
  return summary || count || (note ? note : 'No rows');
}
