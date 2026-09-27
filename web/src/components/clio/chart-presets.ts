import boxplot from './chart-assets/presets/boxplot.json';
import heatmap from './chart-assets/presets/heatmap.json';
import scatter from './chart-assets/presets/scatter.json';
import spectra from './chart-assets/presets/spectra.json';
import trajectories from './chart-assets/presets/trajectories.json';
import {
  CHART_SPEC_RULES,
  checkChartSpec,
  describeChartSpecViolations,
  isJsonObject,
} from './chart-spec-guard';

/**
 * TypeScript mirror of `clio_schemas.a2ui.chart_spec.render_preset`
 * (clio-schemas 0.5.0). The templates in `chart-assets/presets/` are byte
 * copies of `schemas/a2ui/chart/presets/*.json`; the grammar has two
 * constructs, implemented exactly as the Python renderer does:
 *
 * - a string that is wholly `"{{slot}}"` becomes the slot value; a slot inside
 *   a longer string is interpolated in a single pass;
 * - `{"$if": slot, "then": X, "else": Y}` becomes X when the slot is provided
 *   (after defaults) and Y otherwise; with no `else` the enclosing key or
 *   array element is dropped.
 *
 * `test-fixtures/chart/preset_cases.json` pins the output to the Python one.
 */

export type ChartPresetName = 'trajectories' | 'heatmap' | 'spectra' | 'boxplot' | 'scatter';

export type ChartPresetSlot =
  | 'xField'
  | 'yField'
  | 'entityField'
  | 'colorField'
  | 'facetField'
  | 'xType'
  | 'selectionParam';

export type ChartPresetFields = Partial<Record<ChartPresetSlot, string | null | undefined>>;

interface ChartPresetDocument {
  preset: string;
  description: string;
  requiredFields: string[];
  optionalFields: string[];
  defaults?: Record<string, string>;
  template: unknown;
}

export const CHART_PRESETS: Readonly<Record<ChartPresetName, ChartPresetDocument>> = {
  boxplot,
  heatmap,
  scatter,
  spectra,
  trajectories,
};

export const CHART_PRESET_NAMES = CHART_SPEC_RULES.presets as readonly ChartPresetName[];
const PRESET_SLOTS: ReadonlySet<string> = new Set(CHART_SPEC_RULES.presetSlots);
const X_TYPES: readonly string[] = CHART_SPEC_RULES.xTypes;
const SELECTION_PARAM = new RegExp(CHART_SPEC_RULES.selectionParamPattern, 'u');
const SLOT = /\{\{([A-Za-z]+)\}\}/gu;
const WHOLE_SLOT = /^\{\{([A-Za-z]+)\}\}$/u;

/** A preset could not be rendered: an unknown preset, a missing or unused field, or a bad value. */
export class ChartPresetError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ChartPresetError';
  }
}

export function isChartPresetName(name: string): name is ChartPresetName {
  return (CHART_PRESET_NAMES as readonly string[]).includes(name);
}

const OMIT = Symbol('omit');

function fill(node: unknown, fields: Readonly<Record<string, string>>, preset: string): unknown {
  if (isJsonObject(node)) {
    if ('$if' in node) {
      const extra = Object.keys(node).filter((key) => !['$if', 'then', 'else'].includes(key));
      const slot = node.$if;
      if (
        extra.length ||
        !('then' in node) ||
        typeof slot !== 'string' ||
        !PRESET_SLOTS.has(slot)
      ) {
        throw new ChartPresetError(
          `preset '${preset}': malformed $if node ${JSON.stringify(node)}`,
        );
      }
      if (Object.hasOwn(fields, slot)) return fill(node.then, fields, preset);
      return 'else' in node ? fill(node.else, fields, preset) : OMIT;
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      const filled = fill(value, fields, preset);
      if (filled !== OMIT) out[key] = filled;
    }
    return out;
  }
  if (Array.isArray(node)) {
    return node.map((value) => fill(value, fields, preset)).filter((value) => value !== OMIT);
  }
  if (typeof node === 'string') {
    const slotValue = (slot: string): string => {
      if (!Object.hasOwn(fields, slot)) {
        throw new ChartPresetError(`preset '${preset}': slot '${slot}' used but not provided`);
      }
      return fields[slot]!;
    };
    const whole = WHOLE_SLOT.exec(node);
    if (whole) return slotValue(whole[1]!);
    return node.replace(SLOT, (_match, slot: string) => slotValue(slot));
  }
  return node;
}

/**
 * Render preset `name` with `fields` into a guard-checked Vega-Lite spec.
 * A `null`/`undefined` field counts as not provided.
 *
 * @throws ChartPresetError for an unknown preset, a missing required field, a
 *   field the preset does not use, a bad `xType`/`selectionParam`, or a
 *   rendered spec that fails the guard (a template bug).
 */
export function renderChartPreset(
  name: string,
  fields: ChartPresetFields,
): Record<string, unknown> {
  if (!isChartPresetName(name)) {
    throw new ChartPresetError(
      `unknown chart preset '${name}'; expected one of ${CHART_PRESET_NAMES.join(', ')}`,
    );
  }
  const document = CHART_PRESETS[name];
  const provided: Record<string, string> = {};
  for (const [slot, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined) provided[slot] = value;
  }
  const allowed = new Set([...document.requiredFields, ...document.optionalFields]);
  const unknown = Object.keys(provided)
    .filter((slot) => !allowed.has(slot))
    .sort();
  if (unknown.length) {
    throw new ChartPresetError(`preset '${name}' does not use field(s) ${unknown.join(', ')}`);
  }
  const missing = document.requiredFields.filter((slot) => !Object.hasOwn(provided, slot));
  if (missing.length) {
    throw new ChartPresetError(`preset '${name}' requires field(s) ${missing.join(', ')}`);
  }
  for (const [slot, value] of Object.entries(provided)) {
    if (typeof value !== 'string' || !value) {
      throw new ChartPresetError(`preset '${name}': ${slot} must be a non-empty string`);
    }
  }
  if (provided.xType !== undefined && !X_TYPES.includes(provided.xType)) {
    throw new ChartPresetError(
      `xType must be one of ${X_TYPES.join(', ')}, got '${provided.xType}'`,
    );
  }
  if (provided.selectionParam !== undefined && !SELECTION_PARAM.test(provided.selectionParam)) {
    throw new ChartPresetError(`selectionParam '${provided.selectionParam}' is not a valid name`);
  }
  const spec = fill(document.template, { ...document.defaults, ...provided }, name);
  const violations = checkChartSpec(spec);
  if (violations.length || !isJsonObject(spec)) {
    throw new ChartPresetError(
      `preset '${name}' rendered an invalid spec: ${describeChartSpecViolations(violations)}`,
    );
  }
  return spec;
}
