import { isJsonObject } from './chart-spec-guard';

/** Show a key for a few named curves without flooding the plot for dense series. */
export function withSeriesLegend(
  spec: Record<string, unknown>,
  rows: readonly Record<string, unknown>[],
  preset: string | undefined,
  entityField: string | undefined,
  colorField: string | undefined,
): { spec: Record<string, unknown>; visible: boolean } {
  if ((preset !== 'trajectories' && preset !== 'spectra') || !entityField || colorField) {
    return { spec, visible: false };
  }
  const encoding = isJsonObject(spec.encoding) ? spec.encoding : undefined;
  const color = encoding?.color;
  if (!encoding || !isJsonObject(color) || color.field !== entityField || color.legend !== null) {
    return { spec, visible: false };
  }
  const names = new Set(rows.map((row) => row[entityField]).filter((value) => value != null));
  if (names.size < 2 || names.size > 8) return { spec, visible: false };
  return {
    spec: { ...spec, encoding: { ...encoding, color: { ...color, legend: { title: entityField } } } },
    visible: true,
  };
}
