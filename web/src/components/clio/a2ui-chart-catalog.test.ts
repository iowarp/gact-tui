import { describe, expect, it } from 'vitest';
import componentCases from '@/test-fixtures/chart/component_cases.json';
import selectionStateCases from '@/test-fixtures/chart/selection_state_cases.json';
import { chartComponentSchema } from './a2ui-chart-catalog';
import { renderChartPreset, type ChartPresetFields } from './chart-presets';
import { checkChartSpec } from './chart-spec-guard';
import { parseSelectionState } from './selection-state';

/** What the message processor validates: the payload without `id` and `component`. */
function properties(payload: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, component: _component, ...rest } = payload;
  return rest;
}

/** The renderer's own checks after the schema: the spec guard, or a preset that renders. */
function renders(props: Record<string, unknown>): boolean {
  if (props.spec) return checkChartSpec(props.spec).length === 0;
  try {
    const slots = ['xField', 'yField', 'entityField', 'colorField', 'facetField', 'xType'];
    const fields = Object.fromEntries(slots.map((slot) => [slot, props[slot]]));
    renderChartPreset(
      props.preset as string,
      {
        ...fields,
        selectionParam: props.selectionParam,
      } as ChartPresetFields,
    );
    return true;
  } catch {
    return false;
  }
}

describe('clio.chart.v1 zod mirror', () => {
  it.each(componentCases.cases.map((testCase) => [testCase.name, testCase] as const))(
    'agrees with the catalog JSON Schema on %s',
    (_name, testCase) => {
      const props = properties(testCase.payload as Record<string, unknown>);
      const parsed = chartComponentSchema.safeParse(props);
      expect(parsed.success).toBe(testCase.jsonSchemaValid);
      // Full validity (the Python bounded validator) = schema + guard/preset render.
      expect(parsed.success && renders(props)).toBe(testCase.valid);
    },
  );

  it('keeps the schema a plain object so the binder finds the selection binding', () => {
    // A ZodEffects here would hide `selection` from web_core's generic binder.
    expect((chartComponentSchema._def as { typeName: string }).typeName).toBe('ZodObject');
    expect(chartComponentSchema.shape.selection).toBeDefined();
  });
});

describe('SelectionState', () => {
  it.each(selectionStateCases.cases.map((testCase) => [testCase.name, testCase] as const))(
    'reads %s as the catalog $defs/SelectionState does',
    (_name, testCase) => {
      expect(parseSelectionState(testCase.value) !== undefined).toBe(testCase.valid);
    },
  );
});
