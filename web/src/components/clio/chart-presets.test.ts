import { describe, expect, it } from 'vitest';
import presetCases from '@/test-fixtures/chart/preset_cases.json';
import { CHART_PRESET_FIELD_RULES } from './a2ui-chart-catalog';
import {
  CHART_PRESET_NAMES,
  CHART_PRESETS,
  ChartPresetError,
  renderChartPreset,
  type ChartPresetFields,
} from './chart-presets';

describe('chart presets', () => {
  it.each(presetCases.cases.map((testCase) => [testCase.name, testCase] as const))(
    'renders %s exactly as the Python renderer does',
    (_name, testCase) => {
      expect(renderChartPreset(testCase.preset, testCase.fields as ChartPresetFields)).toEqual(
        testCase.expected,
      );
    },
  );

  it.each(presetCases.errorCases.map((testCase) => [testCase.name, testCase] as const))(
    'refuses %s',
    (_name, testCase) => {
      expect(() =>
        renderChartPreset(testCase.preset, testCase.fields as ChartPresetFields),
      ).toThrow(ChartPresetError);
    },
  );

  it('treats a null field as not provided', () => {
    expect(
      renderChartPreset('scatter', {
        xField: 'x',
        yField: 'y',
        entityField: 'e',
        colorField: null,
      }),
    ).toEqual(renderChartPreset('scatter', { xField: 'x', yField: 'y', entityField: 'e' }));
  });

  it('names what is missing', () => {
    expect(() =>
      renderChartPreset('heatmap', { xField: 'x', yField: 'y', entityField: 'e' }),
    ).toThrow("preset 'heatmap' requires field(s) colorField");
  });

  it('keeps the catalog adapter’s per-preset field rules in step with the templates', () => {
    const fillFields = ['xField', 'yField', 'entityField', 'colorField', 'facetField', 'xType'];
    for (const name of CHART_PRESET_NAMES) {
      const document = CHART_PRESETS[name];
      const used = new Set([...document.requiredFields, ...document.optionalFields]);
      expect(CHART_PRESET_FIELD_RULES[name]).toEqual({
        required: document.requiredFields,
        forbidden: fillFields.filter((field) => !used.has(field)),
      });
    }
  });

  it('gives every preset a point selection on its entity field', () => {
    for (const name of CHART_PRESET_NAMES) {
      const spec = renderChartPreset(name, {
        xField: 'x',
        yField: 'y',
        entityField: 'run',
        colorField: 'c',
      });
      expect(JSON.stringify(spec)).toContain('"fields":["run"]');
    }
  });
});
