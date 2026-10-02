import type { ClioChartProps } from './a2ui-chart';
import type { ChartRow } from './chart-data';
import { ChartPresetError, renderChartPreset } from './chart-presets';
import { checkChartSpec, describeChartSpecViolations } from './chart-spec-guard';
import { isSelectionValue, type SelectionValue } from './selection-state';

/** Keep an unbounded data column from creating an unusable keyboard selector. */
const MAX_KEYBOARD_SELECTABLE_CANDIDATES = 200;

export function distinctFieldValues(
  rows: readonly ChartRow[] | undefined,
  field: string | undefined,
): SelectionValue[] {
  if (!field || !rows) return [];
  const seen = new Set<SelectionValue>();
  for (const row of rows) {
    const raw = row[field];
    if (isSelectionValue(raw)) seen.add(raw);
  }
  return seen.size > MAX_KEYBOARD_SELECTABLE_CANDIDATES ? [] : [...seen];
}

type BuiltSpec =
  | { spec: Record<string, unknown>; error?: undefined }
  | { spec?: undefined; error: string };

type ChartDefinition = Pick<
  ClioChartProps,
  'spec' | 'preset' | 'xField' | 'yField' | 'entityField' | 'colorField' | 'facetField' | 'xType'
>;

export function buildSpec(definition: ChartDefinition, param: string): BuiltSpec {
  const { preset, spec, ...fields } = definition;
  if (preset) {
    try {
      return { spec: renderChartPreset(preset, { ...fields, selectionParam: param }) };
    } catch (error) {
      if (error instanceof ChartPresetError) return { error: error.message };
      throw error;
    }
  }
  if (!spec) return { error: 'the chart names neither a preset nor a spec.' };
  const violations = checkChartSpec(spec);
  if (violations.length) {
    return {
      error: `the spec breaks the chart rules: ${describeChartSpecViolations(violations)}.`,
    };
  }
  return { spec };
}
