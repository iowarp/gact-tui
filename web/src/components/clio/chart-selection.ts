import type { View } from 'vega';
import {
  isSelectionValue,
  selectionKey,
  type SelectionState,
  type SelectionValue,
  type SelectionWriter,
} from './selection-state';

/**
 * Links a Vega-Lite point selection to a bound `SelectionState`.
 *
 * - chart → data model: a listener on the selection param's signal reads the
 *   selected values of the selection field and writes
 *   `{field, values, source: <component id>}`, debounced, and only when the
 *   content changed.
 * - data model → chart: a state written by another component (its `source`
 *   is not this chart) replaces the param's `<param>_store` dataset with
 *   tuples in Vega-Lite's internal point-selection format, then re-runs the
 *   view. The echo that change raises on the signal is recognised and never
 *   written back, so two linked views cannot ping-pong.
 *
 * The store format is Vega-Lite's, not a public API; `chart-selection.test.ts`
 * pins it against the installed vega-lite with a real (headless) view.
 */

/** Keys the resolved selection signal carries besides data fields. */
const RESOLVED_META_KEYS = new Set(['vlPoint', 'vlMulti', '_vgsid_']);

/** Debounce for chart → data model writes. Unit: milliseconds. */
export const CHART_SELECTION_WRITE_DEBOUNCE_MS = 120;

/** One Vega-Lite point-selection store tuple (vega-lite 6 `SelectionStore` entry). */
export interface VegaLitePointTuple {
  unit: string;
  fields: Array<{ type: 'E'; field: string }>;
  values: SelectionValue[];
}

/** The store dataset Vega-Lite keeps a selection param's tuples in. */
export function selectionStoreName(param: string): string {
  return `${param}_store`;
}

/**
 * The selected values from a resolved point-selection signal
 * (`{<field>: [values], vlPoint: …}`), or `undefined` when no data field can
 * be named (e.g. a selection keyed only by Vega's internal row id).
 */
export function selectionFromSignal(
  resolved: unknown,
  preferredField: string | undefined,
): { field: string; values: SelectionValue[] } | undefined {
  const record =
    typeof resolved === 'object' && resolved !== null && !Array.isArray(resolved)
      ? (resolved as Record<string, unknown>)
      : {};
  const dataKeys = Object.keys(record).filter((key) => !RESOLVED_META_KEYS.has(key));
  const field =
    preferredField && (preferredField in record || dataKeys.length === 0)
      ? preferredField
      : dataKeys.length === 1
        ? dataKeys[0]
        : preferredField;
  if (!field) return undefined;
  const raw = record[field];
  const values = Array.isArray(raw) ? raw.filter(isSelectionValue) : [];
  return { field, values };
}

/** Store tuples that select exactly `values` of `field` (one tuple per value). */
export function selectionStoreTuples(
  field: string,
  values: readonly SelectionValue[],
): VegaLitePointTuple[] {
  return values.map((value) => ({ unit: '', fields: [{ type: 'E', field }], values: [value] }));
}

/** Whether the compiled view defines a signal named `param`. */
export function viewHasSignal(view: Pick<View, 'signal'>, param: string): boolean {
  try {
    view.signal(param);
    return true;
  } catch {
    return false;
  }
}

export interface ChartSelectionBinding {
  /** Show a state written elsewhere; a no-op for this chart's own writes and unchanged content. */
  apply: (state: SelectionState) => Promise<void>;
  /**
   * Selects `values` of the bound field exactly as a native pointer
   * click/drag would: mutates the view's own selection store and re-runs it,
   * so the existing signal listener reports it through `write` the same way
   * a mouse-driven selection does. This is how a keyboard-operable control
   * (a `<Select>` beside the chart, #1533 #506 LOW — arbitrary brush/lasso
   * gestures have no keyboard equivalent, but a point selection does) drives
   * the identical propagation path a click takes, with no special-casing
   * anywhere else.
   */
  select: (values: readonly SelectionValue[]) => Promise<void>;
  dispose: () => void;
}

export interface ChartSelectionOptions {
  /** Id of the chart component; written as `source`, and how its own echo is recognised. */
  componentId: string;
  param: string;
  /** Field whose values the selection reports (`selectionField`, else the preset's `entityField`). */
  field: string | undefined;
  write: SelectionWriter | undefined;
  debounceMs?: number;
}

type LinkedView = Pick<View, 'addSignalListener' | 'removeSignalListener' | 'data' | 'runAsync'>;

/** Wire one embedded view's selection param to the bound selection (see the module comment). */
export function bindChartSelection(
  view: LinkedView,
  {
    componentId,
    param,
    field,
    write,
    debounceMs = CHART_SELECTION_WRITE_DEBOUNCE_MS,
  }: ChartSelectionOptions,
): ChartSelectionBinding {
  let lastKey: string | undefined;
  // A spec chart with no selectionField reports the field it last selected when it clears.
  let lastField = field;
  let applying = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const listener = (_name: string, resolved: unknown) => {
    if (applying || !write) return;
    const selection = selectionFromSignal(resolved, field ?? lastField);
    if (!selection) return;
    const key = selectionKey(selection.field, selection.values);
    if (key === lastKey) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed || key === lastKey) return;
      lastKey = key;
      lastField = selection.field;
      write({ field: selection.field, values: selection.values, source: componentId });
    }, debounceMs);
  };
  view.addSignalListener(param, listener);

  return {
    apply: async (state) => {
      if (disposed || state.source === componentId) return;
      const key = selectionKey(state.field, state.values);
      if (key === lastKey) return;
      lastKey = key;
      lastField = field ?? state.field;
      if (timer !== undefined) {
        // A pending local write is superseded by the newer external state.
        clearTimeout(timer);
        timer = undefined;
      }
      applying = true;
      try {
        view.data(selectionStoreName(param), selectionStoreTuples(state.field, state.values));
        await view.runAsync();
      } finally {
        applying = false;
      }
    },
    select: async (values) => {
      const selectField = field ?? lastField;
      if (disposed || !selectField) return;
      view.data(selectionStoreName(param), selectionStoreTuples(selectField, values));
      await view.runAsync();
    },
    dispose: () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      view.removeSignalListener(param, listener);
    },
  };
}
